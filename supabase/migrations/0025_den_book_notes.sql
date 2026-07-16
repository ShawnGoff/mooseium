-- Marginalia: link a saved book to the document that collects its highlights
-- and notes. Deleting the note doc just unlinks it (set null), never the book.

alter table den_books
  add column if not exists note_document_id uuid
  references den_documents (id) on delete set null;
