// QuickNotes API client.
// Talks to JSONPlaceholder, a free practice API. The real QuickNotes API is
// described in docs/api-design.md.

const API_URL = "https://jsonplaceholder.typicode.com/posts";
const NOTES_LIMIT = 10;
const MAX_TITLE_LENGTH = 100;

const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const form = document.getElementById("note-form");
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const submitBtn = document.getElementById("submit-btn");
const notesList = document.getElementById("notes-list");

// The notes currently shown on the page.
//
// IMPORTANT: JSONPlaceholder only PRETENDS to save changes. A POST returns
// the new note with id 101 but does not store it, and a DELETE returns
// success but nothing is removed on the server. So the page itself is the
// source of truth: when the server answers with a success status, we update
// this array and re-draw the list. Clicking "Load notes" again fetches the
// original 10 notes from the server, so created notes disappear and deleted
// notes come back. With the real QuickNotes API the server would keep the
// data. Notes are removed by object reference (not by id) because every
// created note gets the same fake id (101).
let notes = [];
let isBusy = false;

// ---------- Reusable request helper ----------

async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const error = new Error(`Server responded with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return { data, status: response.status };
}

// ---------- API functions ----------

// GET: load the first 10 notes.
function getNotes() {
  return request(`${API_URL}?_limit=${NOTES_LIMIT}`);
}

// POST: create a note.
function createNote(note) {
  return request(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(note),
  });
}

// DELETE: remove a note by id.
function deleteNote(id) {
  return request(`${API_URL}/${id}`, { method: "DELETE" });
}

// ---------- UI helpers ----------

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type ? `status-${type}` : "";
}

// Disable (or enable) every button while a request is running.
function setBusy(busy) {
  isBusy = busy;
  loadBtn.disabled = busy;
  submitBtn.disabled = busy;
  notesList.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
}

// User text is only ever inserted with textContent, never innerHTML.
function renderNotes() {
  notesList.textContent = "";

  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No notes to show. Load notes or add a new one.";
    notesList.appendChild(empty);
    return;
  }

  notes.forEach((note) => {
    const item = document.createElement("li");
    item.className = "note";

    const title = document.createElement("h3");
    title.textContent = note.title;
    item.appendChild(title);

    if (note.body) {
      const body = document.createElement("p");
      body.textContent = note.body;
      item.appendChild(body);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = isBusy;
    deleteBtn.setAttribute("aria-label", `Delete note: ${note.title}`);
    deleteBtn.addEventListener("click", () => handleDelete(note));
    item.appendChild(deleteBtn);

    notesList.appendChild(item);
  });
}

// ---------- Event handlers ----------

async function handleLoad() {
  setBusy(true);
  setStatus("Loading notes...", "loading");

  try {
    const { data } = await getNotes();
    if (!Array.isArray(data)) {
      throw new Error("Unexpected response from the server");
    }
    notes = data;
    renderNotes();
    setStatus(`Loaded ${data.length} notes from the server.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(
      "Sorry, we couldn't load your notes. Please check your connection and try again.",
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  // Validation: title required, max 100 characters. Body is optional.
  if (title === "") {
    setStatus("Please enter a title for your note.", "error");
    titleInput.focus();
    return;
  }
  if (title.length > MAX_TITLE_LENGTH) {
    setStatus(
      `The title is too long (${title.length} characters). The maximum is ${MAX_TITLE_LENGTH}.`,
      "error"
    );
    titleInput.focus();
    return;
  }

  setBusy(true);
  setStatus("Saving note...", "loading");

  try {
    const { data, status } = await createNote({ title, body, userId: 1 });
    notes.unshift(data); // newest note goes to the top
    renderNotes();
    setStatus(`Note created (status ${status}, id ${data.id}).`, "success");
    form.reset();
  } catch (error) {
    console.error(error);
    setStatus("Sorry, we couldn't save your note. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}

async function handleDelete(note) {
  setBusy(true);
  setStatus("Deleting note...", "loading");

  try {
    const { status } = await deleteNote(note.id);
    notes = notes.filter((n) => n !== note);
    renderNotes();
    setStatus(`Note deleted (status ${status}).`, "success");
  } catch (error) {
    console.error(error);
    setStatus("Sorry, we couldn't delete that note. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}

loadBtn.addEventListener("click", handleLoad);
form.addEventListener("submit", handleSubmit);
