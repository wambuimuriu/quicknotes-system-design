# QuickNotes API Design

This is the design of the **real** QuickNotes API that the backend team should build. It is not JSONPlaceholder.

## Conventions

- **Base URL:** `https://api.quicknotes.example/v1`
- **Format:** JSON for every request and response (`Content-Type: application/json`).
- **Authentication:** every endpoint except `POST /auth/login` needs the header `Authorization: Bearer <token>`.
- **Naming:** plural nouns for resources (`/notes`, `/tags`); the HTTP method says what to do. JSON fields use `snake_case`, matching the database.
- **Ownership:** a user can only see and change their own notes and tags.
- **Timestamps:** ISO 8601 in UTC, for example `2026-10-24T09:30:00Z`.

## Endpoints

| # | Method | Path | Description | Success status |
|---|--------|------|-------------|----------------|
| 1 | POST | `/auth/login` | Log in with email and password and receive a token | 200 OK |
| 2 | GET | `/notes` | List the current user's notes (newest first). Supports `?limit=`, `?cursor=`, `?tag=` and `?q=` (search) | 200 OK |
| 3 | POST | `/notes` | Create a note | 201 Created |
| 4 | GET | `/notes/{id}` | Get one note, including its tags | 200 OK |
| 5 | PUT | `/notes/{id}` | Replace a note's title and body | 200 OK |
| 6 | DELETE | `/notes/{id}` | Delete a note | 204 No Content |
| 7 | GET | `/tags` | List the current user's tags | 200 OK |
| 8 | POST | `/notes/{id}/tags` | Attach a tag (by name) to a note, creating the tag if needed | 201 Created |
| 9 | DELETE | `/notes/{id}/tags/{tag_id}` | Remove a tag from a note | 204 No Content |

Notes on the design:

- `POST` creates, `GET` reads, `PUT` replaces, `DELETE` removes. `GET` never changes data.
- Lists are **paginated** with a cursor so one request never returns thousands of notes.
- Deleting a note that was already deleted returns 404, so retries are visible to the client.

## Example: create a note

`POST /notes`

Request:

```json
{
  "title": "Buy groceries",
  "body": "Milk, eggs, bread",
  "tags": ["shopping", "home"]
}
```

Response: `201 Created`, with a `Location: /v1/notes/42` header.

```json
{
  "id": 42,
  "title": "Buy groceries",
  "body": "Milk, eggs, bread",
  "tags": [
    { "id": 3, "name": "shopping" },
    { "id": 7, "name": "home" }
  ],
  "created_at": "2026-10-24T09:30:00Z",
  "updated_at": "2026-10-24T09:30:00Z"
}
```

Rules: `title` is required and at most 100 characters; `body` is optional; `tags` is optional.

## Example: list notes

`GET /notes?limit=2&tag=shopping`

Response: `200 OK`

```json
{
  "data": [
    {
      "id": 42,
      "title": "Buy groceries",
      "body": "Milk, eggs, bread",
      "tags": [
        { "id": 3, "name": "shopping" },
        { "id": 7, "name": "home" }
      ],
      "created_at": "2026-10-24T09:30:00Z",
      "updated_at": "2026-10-24T09:30:00Z"
    },
    {
      "id": 37,
      "title": "Birthday gift ideas",
      "body": "Book, headphones",
      "tags": [{ "id": 3, "name": "shopping" }],
      "created_at": "2026-10-20T16:05:00Z",
      "updated_at": "2026-10-21T08:12:00Z"
    }
  ],
  "next_cursor": "eyJpZCI6Mzd9"
}
```

When there are no more pages, `next_cursor` is `null`. An empty list is still a success: `{ "data": [], "next_cursor": null }` with status 200.

## Error status codes

| Status | Name | When the API returns it |
|--------|------|-------------------------|
| 400 | Bad Request | Invalid JSON, a missing title, or a title over 100 characters |
| 401 | Unauthorized | Missing, expired or invalid token, or wrong login details |
| 403 | Forbidden | The user is logged in but tries to access another user's note |
| 404 | Not Found | The note or tag does not exist (or was already deleted) |
| 429 | Too Many Requests | The client exceeded the rate limit (include a `Retry-After` header) |
| 500 | Internal Server Error | An unexpected failure on the server |

All errors use the same body shape, so the client can handle them in one place.

Example `400 Bad Request` (`POST /notes` with a missing title):

```json
{
  "error": {
    "code": "validation_error",
    "message": "The title is required and must be at most 100 characters.",
    "details": [
      { "field": "title", "problem": "required" }
    ]
  }
}
```

Example `404 Not Found`:

```json
{
  "error": {
    "code": "not_found",
    "message": "Note 999 was not found."
  }
}
```

For 500 errors the message stays generic (`"Something went wrong. Please try again."`) so internal details are never leaked; the full error is written to the server logs.
