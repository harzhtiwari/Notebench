# Notebench Domain Glossary

The canonical domain vocabulary for Notebench, an open-source, source-grounded workspace with living editable media.

## Core Entities

**Notebook**:
The top-level workspace container holding a collection of sources, conversations, memory rules, and living artifacts.
_Avoid_: Project, workspace, folder

**Source**:
A reference document, media file, URL, or text snippet ingested into a notebook and indexed for grounded retrieval.
_Avoid_: File, attachment, upload, context document

**Artifact**:
A structured, living deliverable (document, slide deck, or audio script) represented as a canonical AST with block-level UUIDs.
_Avoid_: Note, output, card, document blob

**Workbench**:
The active, interactive editor surface tailored to a specific artifact type (Document, Slide Deck, Audio Script).
_Avoid_: Canvas, studio, editor tab

## Authoring & Editing Engine

**Block**:
An indivisible, addressable node inside an artifact AST with an immutable UUID.
_Avoid_: Paragraph, slide element, node, section

**Surgical Patch**:
A minimal, targeted update that modifies only specified block UUIDs without rewriting or drifting adjacent blocks.
_Avoid_: Full rewrite, diffuse update, regeneration

**Sibling Invariance**:
The invariant verification guarantee that untouched sibling blocks remain bit-for-bit identical before and after a surgical patch.
_Avoid_: Section locking, delta check

## Storage & Operations

**Trash**:
A 30-day temporary retention state where deleted notebooks and sources remain recoverable before permanent hard deletion.
_Avoid_: Bin, soft delete, archive

**Vault**:
The server-side AES-256-GCM encrypted store in `.notebook/vault/` holding model provider API keys.
_Avoid_: Secret store, keychain, env store

**Cascading Deletion**:
An atomic operation that permanently purges database records, physical disk files, vector embeddings, caches, and queued jobs.
_Avoid_: Row deletion, partial wipe

**Memory Rule**:
A persistent, user-defined instruction or style guideline injected into agent context to govern response tone and formatting.
_Avoid_: System prompt, persona, custom instruction
