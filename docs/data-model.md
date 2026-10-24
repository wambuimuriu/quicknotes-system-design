# QuickNotes Data Model

The SQL below is written for **PostgreSQL**. (In SQLite, use `INTEGER PRIMARY KEY` for ids and `DEFAULT CURRENT_TIMESTAMP` for timestamps.)

## Entities

### users

| Column | Type | Key / constraint |
|--------|------|------------------|
| id | BIGINT | **Primary key** |
| email | TEXT | NOT NULL, UNIQUE |
| password_hash | TEXT | NOT NULL |
| display_name | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL, default now |

### notes

| Column | Type | Key / constraint |
|--------|------|------------------|
| id | BIGINT | **Primary key** |
| user_id | BIGINT | **Foreign key** to `users(id)`, NOT NULL |
| title | VARCHAR(100) | NOT NULL |
| body | TEXT | optional |
| created_at | TIMESTAMPTZ | NOT NULL, default now |
| updated_at | TIMESTAMPTZ | NOT NULL, default now |

### tags

| Column | Type | Key / constraint |
|--------|------|------------------|
| id | BIGINT | **Primary key** |
| user_id | BIGINT | **Foreign key** to `users(id)`, NOT NULL |
| name | VARCHAR(50) | NOT NULL; unique per user |

### note_tags (join table)

| Column | Type | Key / constraint |
|--------|------|------------------|
| note_id | BIGINT | **Foreign key** to `notes(id)`, part of the primary key |
| tag_id | BIGINT | **Foreign key** to `tags(id)`, part of the primary key |

The primary key of `note_tags` is the pair `(note_id, tag_id)`.

## Relationships

- **users to notes is one-to-many:** one user owns many notes, but each note belongs to exactly one user (`notes.user_id`).
- **users to tags is one-to-many:** one user creates many tags, and each tag belongs to one user (`tags.user_id`).
- **notes to tags is many-to-many:** a note can have many tags (for example "work" and "urgent"), and a tag can be used on many notes. A relational table cannot store this directly, so the **join table `note_tags`** holds one row per note-tag pair. It turns the many-to-many into two one-to-many relationships, and its composite primary key prevents the same tag being attached to the same note twice.

## CREATE TABLE statements

```sql
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notes (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(100) NOT NULL,
  body       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tags (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    VARCHAR(50) NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
  note_id BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  BIGINT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);
```

## Example queries

**1. A user's 20 newest notes** (this serves `GET /notes`):

```sql
SELECT id, title, body, created_at
FROM notes
WHERE user_id = 7
ORDER BY created_at DESC
LIMIT 20;
```

**2. All notes with a given tag** (uses a JOIN through the join table):

```sql
SELECT n.id, n.title
FROM notes n
JOIN note_tags nt ON nt.note_id = n.id
JOIN tags t       ON t.id = nt.tag_id
WHERE n.user_id = 7
  AND t.name = 'shopping'
ORDER BY n.created_at DESC;
```

**3. How many notes each tag has** (LEFT JOIN so unused tags show 0):

```sql
SELECT t.name, COUNT(nt.note_id) AS note_count
FROM tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.id
WHERE t.user_id = 7
GROUP BY t.id, t.name
ORDER BY note_count DESC;
```

**4. Update a note** (this serves `PUT /notes/{id}`):

```sql
UPDATE notes
SET title = 'Buy groceries today', body = 'Milk, eggs, bread, rice', updated_at = now()
WHERE id = 42 AND user_id = 7;
```

## Indexes

```sql
CREATE INDEX idx_notes_user_created ON notes (user_id, created_at DESC);
CREATE INDEX idx_note_tags_tag_id   ON note_tags (tag_id);
```

**Why the first one:** almost every request is "show this user's newest notes". Without an index the database would scan every note of every user (hundreds of millions of rows at scale). With `(user_id, created_at DESC)` it jumps straight to the user's rows already in the right order. The cost is slightly slower inserts and some extra storage, which is a good trade for a read-heavy app.

**Why the second one:** the primary key of `note_tags` already speeds up lookups starting from a note, but "all notes with this tag" starts from the tag, so it needs its own index.

## SQL or NoSQL?

I choose **SQL (a relational database such as PostgreSQL)**. QuickNotes data is structured and clearly related: users own notes, and notes and tags form a many-to-many relationship. A relational database enforces these links with foreign keys and unique constraints (one email per user, no duplicate tags on a note), handles joins such as "all notes with this tag" naturally, and gives transactions so that creating a note and attaching its tags either all succeeds or all fails. Our estimated load (about 10 writes per second on average, under 1 TB of new data per year) is well within what one primary database with a read replica can handle, so we do not need NoSQL's main advantage of scaling writes across many machines. If the app later grows far beyond this, we can add sharding by `user_id` or move specific parts (such as full-text search) to a specialised store.
