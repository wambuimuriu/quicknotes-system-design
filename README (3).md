# QuickNotes System Design

QuickNotes started as a browser-only note app. This project prepares it to become an online service for 1 million users. It has two parts:

1. **An API client** (`index.html`, `api.js`, `style.css`) that proves the front end can talk to an API. It loads, creates and deletes notes using the practice API [JSONPlaceholder](https://jsonplaceholder.typicode.com/).
2. **Three design documents** for the backend team that describe the real QuickNotes API, its database and its architecture.

## How to run the API client

1. Download or clone this repository.
2. Open `index.html` in a browser (or use the VS Code "Live Server" extension). No install or build step is needed, but you need an internet connection to reach JSONPlaceholder.
3. Click **Load notes** to fetch 10 notes (GET).
4. Fill in the form and click **Add note** to create a note (POST). The title is required and can be at most 100 characters.
5. Click **Delete** on a note to remove it (DELETE).

The status line under the Load button shows loading, success and error messages, and the list shows an empty-state message when there are no notes.

**Note:** JSONPlaceholder does not really save changes. A created note gets the fake id 101, and a deleted note returns after you click **Load notes** again. The page updates its own list when the server reports success (explained in a comment in `api.js`).

## Documents

- [API design](docs/api-design.md): REST endpoints, JSON examples and error codes
- [Data model](docs/data-model.md): tables, relationships, SQL, indexes and the SQL vs NoSQL decision
- [Architecture](docs/architecture.md): requirements, load estimates, diagram, request flows, trade-offs

## What I learned

- **How the browser talks to an API:** `fetch` does not throw on 404 or 500 responses, so I have to check `response.ok` myself and throw an error, and put every request in `try / catch / finally`.
- **Users need to see what is happening:** loading, success, error and empty states, plus disabling buttons while a request runs, make an app feel reliable and prevent double submissions.
- **Relational design:** a many-to-many relationship (notes and tags) needs a join table, and an index such as `(user_id, created_at)` can make the most common query fast.
- **Scaling thinking:** a quick estimate (users, requests per day, divide by 100,000 seconds) shows whether the system is read-heavy, which tells me to use a cache, a CDN and a read replica, and a queue for slow jobs.
- **Every choice is a trade-off:** caching and replicas are faster but can show slightly old data, so a good design explains what it gives up.
