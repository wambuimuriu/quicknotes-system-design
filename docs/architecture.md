# QuickNotes Architecture

## Requirements

### Functional requirements

- Users can sign up and log in.
- Users can create, view, edit and delete their own notes.
- Users can add tags to notes and filter or search their notes by tag or text.
- Users see only their own notes, and their notes are available on every device they log in from.

### Non-functional requirements

- **Scale:** support 1,000,000 registered users.
- **Latency:** loading the notes list should take under 300 ms for most requests.
- **Availability:** about 99.9% uptime; no single machine failure should take the service down.
- **Durability:** a note that was saved successfully must never be lost (backups and replication).
- **Security:** passwords stored as hashes, all traffic over HTTPS, users isolated from each other.
- **Consistency:** a user must see their own changes straight away; slightly old data for a few seconds is acceptable in other places.

## Load estimate for 1 million users

### Assumptions

| Assumption | Value |
|---|---|
| Registered users | 1,000,000 |
| Daily active users | 20% = 200,000 |
| Note-list loads per active user per day | 20 |
| Writes (create, edit, delete) per active user per day | 5 |
| Seconds in a day (estimate) | 100,000 |
| Peak traffic | 5x the average |
| Average stored size of a note, including metadata | 2 KB |

### Results

- **Reads per second:** 200,000 x 20 = 4,000,000 reads/day, and 4,000,000 / 100,000 = **40 reads/second on average, 200 at peak**.
- **Writes per second:** 200,000 x 5 = 1,000,000 writes/day, and 1,000,000 / 100,000 = **10 writes/second on average, 50 at peak**.
- **Storage per year:** at most 1,000,000 new notes/day x 2 KB = 2 GB/day, and 2 GB x 365 = **about 730 GB per year**. With indexes and a replica, plan for roughly 2 TB of disk in the first year.

The system is **read-heavy** (about 4 reads per write), so caching and a read replica give the biggest gains. The numbers are small enough that the design focuses on reliability and growth rather than raw capacity.

## Architecture diagram

```
 Client (browser / mobile app)
        |
        v
 DNS   app.quicknotes.example --> CDN
       api.quicknotes.example --> Load Balancer
        |
        +-----------------------------+
        |                             |
        v                             v
   CDN (static files:           Load Balancer (2 instances,
   index.html, api.js,           health checks, HTTPS)
   style.css)                         |
                        +-------------+-------------+
                        |                           |
                        v                           v
                  App Server 1                App Server 2   ... App Server N
                  (stateless)                 (stateless)
                        |                           |
        +---------------+-------------+-------------+--------------+
        |                             |                            |
        v                             v                            v
   Cache (Redis)               Primary Database ---replication--> Read Replica
   hot note lists,             (all writes)                        (note-list reads)
   sessions
                                      
   App servers also put slow jobs on the Queue:

   App Servers ---> Queue ---> Worker(s) ---> email service, search index,
                                              note exports, cleanup jobs
```

## Components, one sentence each

- **Client:** The browser or mobile app shows the notes and sends API requests, so users never touch the servers directly.
- **DNS:** Translates names like `api.quicknotes.example` into the right addresses, so users reach the service by name and we can move or add infrastructure without changing the address.
- **CDN:** Serves static files (HTML, JavaScript, CSS) from locations near the user, which makes the app load faster and takes that traffic off our servers.
- **Load balancer:** Spreads requests across several app servers and stops sending traffic to unhealthy ones, so no single server is overloaded and one failure is invisible to users.
- **App servers:** Run the API logic (validation, login checks, reading and writing notes) and are stateless, so we can add more when traffic grows.
- **Cache (Redis):** Keeps frequently read data such as a user's recent note list in memory, so repeated reads skip the slower database.
- **Primary database:** Is the source of truth for all users, notes and tags and applies every write consistently.
- **Read replica:** Holds a live copy of the primary and answers read queries, so heavy reading doesn't slow down writes and it can take over if the primary fails.
- **Queue:** Holds background jobs so the API can answer immediately and no job is lost if workers are busy or restarting.
- **Worker:** Takes jobs from the queue (sending emails, updating the search index, producing note exports) and runs them separately from user requests, so slow work never delays an API response.

## Request flows

### GET /notes

1. The client sends `GET /v1/notes` with its token. DNS resolves the API hostname to the load balancer.
2. The load balancer picks a healthy app server.
3. The app server checks the token and finds the user's id.
4. It looks in the **cache** for `notes:user:{id}:page1`.
5. **Cache hit:** it returns the cached JSON straight away (step 8).
6. **Cache miss:** it queries the **read replica** for the user's newest notes (with their tags).
7. It stores the result in the cache with a short expiry (for example 60 seconds).
8. The app server returns `200 OK` with the JSON list, and the client displays the notes.

### POST /notes

1. The client sends `POST /v1/notes` with the token and the JSON body `{title, body, tags}`.
2. The load balancer sends the request to an app server.
3. The app server checks the token, then **validates** the input (title required, max 100 characters). Invalid input gets `400 Bad Request`.
4. It writes the note (and any tag links) to the **primary database** in one transaction.
5. It **invalidates** the user's cached note lists (deletes `notes:user:{id}:*`), so the next read is fresh.
6. It puts a job on the **queue** (for example "update search index") and does not wait for it.
7. It returns `201 Created` with the new note and a `Location` header.
8. A **worker** picks up the job later and updates the search index.

To avoid showing a user a stale list right after they save, the next read after a write can go to the primary instead of the replica.

## Trade-offs

1. **Cache speed vs freshness.** Caching note lists makes reads much faster, but a cached list can briefly be out of date. We reduce this by deleting the user's cache entries on every write and using a short expiry, at the cost of extra code and a few more database reads after each write.
2. **Read replica scaling vs consistency.** The replica takes read load off the primary, but replication has a small delay, so a user could save a note and not see it on the next read. We handle this by reading from the primary right after a write. It adds some complexity, and it sends a bit more load to the primary.
3. **Queue and worker: fast responses vs delay.** Moving slow work to a queue keeps the API quick and reliable, but results such as search-index updates appear a little later, and there are more components to run and monitor.
4. **SQL consistency vs write scaling.** A single primary database keeps data consistent and is simple to reason about, but all writes go through one machine. That is fine for 50 writes per second at peak; if the app grows 100x we would need sharding by `user_id`.

## Avoiding single points of failure

- **DNS and CDN:** use a managed provider that runs on many servers worldwide.
- **Load balancer:** run at least two instances (or a managed load balancer that is redundant by design), with health checks.
- **App servers:** run two or more in different availability zones; because they are stateless, losing one loses no data.
- **Cache:** run Redis with a replica and automatic failover. The cache only holds copies, so if it is lost the app is slower but still correct, because it falls back to the database.
- **Database:** the read replica is kept up to date and can be promoted to primary if the primary fails; take regular backups and test restoring them.
- **Queue and workers:** use a durable queue that stores jobs on disk and run several workers, so if one crashes another continues, and unfinished jobs are retried.
