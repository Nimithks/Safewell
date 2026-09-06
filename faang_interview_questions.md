# FAANG Interview Q&A Guide: SafeWell Technical Architecture

This guide compiles **100 FAANG-style technical interview questions and answers** directly modeled after the engineering decisions, performance tuning, security systems, and front-end architectures implemented in the SafeWell application.

---

## Table of Contents
1. [FastAPI, Lifespan & System Design (1-25)](#1-fastapi-lifespan--system-design-1-25)
2. [SQLite, Concurrency & WAL Mode (26-50)](#2-sqlite-concurrency--wal-mode-26-50)
3. [Security, Cryptography & Session Management (51-70)](#3-security-cryptography--session-management-51-70)
4. [Zero-Build React & Client Orchestration (71-85)](#4-zero-build-react--client-orchestration-71-85)
5. [AI Integration, Async HTTPX Streams & SSE (86-100)](#5-ai-integration-async-httpx-streams--sse-86-100)

---

## 1. FastAPI, Lifespan & System Design (1-25)

#### Q1: Why did you choose FastAPI over Flask or Django for this real-time health application?
* **Answer:** FastAPI natively supports asynchronous programming (`async/await`) out of the box, making it highly performant for handling I/O-bound operations like Server-Sent Events (SSE) streaming and remote generative AI API requests. Unlike Django (which has synchronous legacy roots) or Flask (which requires Gevent/eventlet for non-blocking stream threads), FastAPI leverages Starlette and Uvicorn, registering exceptionally high throughput and lower memory footprint under concurrent connections.

#### Q2: Explain the purpose of the `@asynccontextmanager` lifespan event handler in your FastAPI setup.
* **Answer:** The `lifespan` context manager handles startup and shutdown logic. We utilize it to instantiate a single, shared `httpx.AsyncClient` instance attached to `app.state.http_client` at startup, and close it cleanly when the application terminates. This prevents resource leaks and avoids the overhead of opening and closing client sessions on every individual chat request.

#### Q3: What is the performance penalty of creating a new HTTP client session on every API request instead of reusing one?
* **Answer:** Creating a new client session for each request forces a complete TCP handshake (SYN-ACK) and TLS negotiation, adding significant latency (often 100ms-300ms) to every request. By reusing a pooled client instance, we keep connections alive (HTTP Keep-Alive), reusing already established TCP channels and reducing connection latency to milliseconds.

#### Q4: Why is it important to configure connection limits (`httpx.Limits`) on the shared HTTP client?
* **Answer:** Restricting active connections prevents the application from exhausting the system's file descriptors or running out of outbound ports under heavy load. We set `max_connections=100` and `max_keepalive_connections=20` to guarantee that outbound traffic to the Gemini API is throttled responsibly, preventing server crashes and socket exhaustion.

#### Q5: How does your rate-limiting implementation protect the backend from Denial of Service (DoS)?
* **Answer:** We implemented a token-bucket rate limiter mapped to a thread-locked dictionary (`RATE_LIMIT_STORE`). It extracts the user ID and remote client IP to isolate limiters, allowing up to 30 requests per minute. Exceeding this triggers a `429 Too Many Requests` HTTP exception immediately, preventing resource exhaustion on heavy SSE stream requests.

#### Q6: Why did you use `threading.Lock` inside the rate limiter instead of keeping it stateless?
* **Answer:** Python's global state is not thread-safe. Since Uvicorn can spawn multiple worker threads or process requests concurrently, multiple async coroutines accessing the `RATE_LIMIT_STORE` concurrently could cause race conditions (e.g. read-then-write updates overwriting each other). The lock guarantees atomic transactions when logging client request timestamps.

#### Q7: In a production scale-out architecture with multiple FastAPI servers, why would your stateless rate-limiter fail, and how would you fix it?
* **Answer:** Our rate-limiter uses an in-memory `defaultdict` (`RATE_LIMIT_STORE`). If traffic is load-balanced across multiple servers, each server will have a separate, isolated memory store, allowing a user to bypass rate limits by hitting different servers. To fix this at scale, we would swap the local memory store with a shared cache like Redis, executing atomic commands (`INCR`/`EXPIRE`) or Lua scripts to track window rates globally.

#### Q8: What is the difference between `def` and `async def` route handlers in FastAPI, and when should you use each?
* **Answer:**
  - `async def` runs directly on the main single-thread ASGI event loop. It should only be used when all calls inside the function are fully asynchronous (non-blocking) and use `await`.
  - `def` is run by FastAPI inside an external, multi-threaded thread pool. It should be used when the code contains blocking synchronous I/O operations (like standard sqlite3 queries) to prevent freezing the event loop.

#### Q9: If a synchronous SQL query is executed inside an `async def` endpoint without `asyncio.to_thread` or running in a separate thread pool, what happens?
* **Answer:** It blocks Python's single event loop thread entirely. No other concurrent client requests, background timers, or SSE streams will be processed until that SQL query completes. This reduces the concurrent capacity of the application to 1.

#### Q10: How did you implement database calls asynchronously without swapping SQLite for PostgreSQL?
* **Answer:** We wrapped synchronous SQLite calls using `asyncio.to_thread` (e.g., during onboarding save and user retrieval). This automatically offloads the blocking SQLite write/read operations to Python's built-in async thread pool, keeping the main event loop responsive.

#### Q11: Explain how dependency injection (`Depends(get_current_user)`) handles authentication in FastAPI.
* **Answer:** FastAPI dependencies evaluate parameters before invoking the route handler. `Depends(get_current_user)` extracts the incoming HTTP authorization header, checks for a valid Bearer token, validates token expiry against the database `sessions` table, and injects the resolved `user` dictionary directly into the endpoint's arguments. If verification fails, it raises an HTTP exception (e.g. 401 Unauthorized), short-circuiting the request.

#### Q12: How are CORS headers configured in your application, and what are the security risks of using wildcards (`"*"`) for `allow_origins`?
* **Answer:** We restrict allowed origins specifically to local host ports (`localhost:3000`, `localhost:5173`, etc.) and enable `allow_credentials=True`. If `allow_origins` is set to `"*"`, browsers will block requests that include credentials (like authentication tokens or cookies) for security reasons. Furthermore, using a wildcard allows malicious sites to read data from the API on behalf of authenticated users.

#### Q13: In your Pydantic schemas, what is the role of `Field(..., min_value=...)` validations?
* **Answer:** Pydantic enforces runtime data parsing and type validation. By defining fields like `currentWeightKg` with structural boundaries (e.g. positive numbers), we reject corrupted or invalid body requests at the gateway level before database layer processing, preventing bad inputs from causing logical exceptions downstream.

#### Q14: Describe the sequence of events when a client request triggers a 500 error on the backend.
* **Answer:** If an unhandled exception occurs inside a route, FastAPI catches it, logs the traceback, aborts the database transaction (if applicable), and returns a generic `500 Internal Server Error` response back to the client. This keeps the server process alive while hiding internal database schemas or API key print traces from the user.

#### Q15: Why is Uvicorn referred to as an ASGI server, and how does it compare to WSGI?
* **Answer:** ASGI (Asynchronous Server Gateway Interface) is a spiritual successor to WSGI (Web Server Gateway Interface) designed to handle asynchronous protocols (like WebSockets, HTTP/2, and long-polling SSE). WSGI is strictly synchronous and operates on a request-response cycle, making it unsuitable for real-time streaming connections.

#### Q16: How would you implement horizontal scaling for this FastAPI backend?
* **Answer:** We would package the application as a Docker container, deploy multiple replicas inside a container orchestrator (e.g., Kubernetes), and route traffic through a reverse proxy (e.g., Nginx or AWS ALB) acting as a load balancer. We would also migrate the database from SQLite to a distributed SQL cluster (like PostgreSQL RDS) and swap local session/rate-limit arrays with Redis.

#### Q17: What are the benefits of using FastAPI's automatic OpenAPI documentation generator?
* **Answer:** It parses Pydantic models and routes dynamically to build an interactive REST document portal (`/docs` or `/redoc`). This guarantees that API documentation is never out of sync with actual backend source code, facilitating frontend integration and developer handoffs.

#### Q18: What is the risk of keeping environment variables like `GEMINI_API_KEY` stored directly in your source code files?
* **Answer:** Storing keys inside code exposes secrets to anyone with repository access and makes it likely to accidentally publish credentials to public version control systems (like GitHub). Instead, we load configs from a local `.env` file excluded from git via `.gitignore`.

#### Q19: Why does your application use `sessionStorage` in the browser instead of `localStorage` to save authentication tokens?
* **Answer:** `sessionStorage` isolates tokens to the specific browser tab and wipes them immediately when the tab is closed. `localStorage` persists data across windows and browser restarts, increasing the window of vulnerability if a device is shared or compromised by Cross-Site Scripting (XSS) attacks.

#### Q20: Explain the concept of token-based authentication used in SafeWell.
* **Answer:** When a user logs in, the server validates their password and generates a cryptographically random session token saved in the `sessions` table. The client receives this token and attaches it as a `Bearer` authorization header in subsequent calls, avoiding the need to transmit the user's password repeatedly.

#### Q21: What is the purpose of the `Path` library from Python's standard library in your environment loading routine?
* **Answer:** Python's `Path` handles filesystem queries across different OS platforms (resolving backslashes on Windows vs. forward slashes on Linux/macOS). We use `.resolve()` and `.parents` to navigate relative directories reliably regardless of the directory from which the python server was executed.

#### Q22: If Uvicorn starts with `--reload`, how does it monitor code changes in development?
* **Answer:** It monitors workspace files for modifications. When a file is edited, it triggers a clean shutdown of active worker threads and restarts the application instance, applying updates instantly without manual process terminations.

#### Q23: How would you securely handle API key rotations in production?
* **Answer:** We would load the API key from a secrets management service (such as HashiCorp Vault, AWS Secrets Manager, or Google Secret Manager) instead of static env files. The application would regularly fetch or subscribe to updates from the manager, reloading keys dynamically without service restarts.

#### Q24: What is the difference between a HTTP `PUT` and `POST` request?
* **Answer:** `POST` is used to create a new resource, and is generally non-idempotent (calling it multiple times creates multiple entities). `PUT` is used to replace or update a resource at a specific URI, and is idempotent (calling it multiple times with the same payload results in the same state).

#### Q25: Why is JSON the standard data exchange format for modern APIs?
* **Answer:** JSON is lightweight, human-readable, and natively supported by JavaScript, making serialization and deserialization extremely fast and requiring minimal overhead compared to XML or binary formats.

---

## 2. SQLite, Concurrency & WAL Mode (26-50)

#### Q26: Why does SQLite raise a "Database is locked" error under high write concurrency, and how does WAL mode solve this?
* **Answer:** By default, SQLite uses rollback journal mode, locking the entire database during write transactions. This blocks active reads and concurrent writes. Write-Ahead Logging (WAL) mode splits writes into a separate `.db-wal` file. Readers can access the main database file concurrently while writes are appended to the WAL file, significantly increasing concurrency and throughput.

#### Q27: How does write-ahead logging guarantee transactional consistency (ACID) during a system crash?
* **Answer:** Changes are committed sequentially to the WAL file before being merged back into the main database. If a crash occurs mid-transaction, SQLite checks the WAL logs on restart, rolls back unfinished writes, and replays completed transactions to recover a clean state.

#### Q28: Why did you set `timeout=20.0` inside `sqlite3.connect()`?
* **Answer:** SQLite allows only one writer at a time. If a concurrent write is attempted while another process has a write lock, SQLite immediately aborts with a busy exception. Specifying `timeout=20.0` tells SQLite to wait and retry for up to 20 seconds for the lock to release before throwing an error, dramatically reducing locking crashes.

#### Q29: What does the statement `conn.row_factory = sqlite3.Row` accomplish in Python database wrappers?
* **Answer:** It switches query results from standard index-based tuples to dictionary-like objects. This allows accessing columns by name (e.g. `row["username"]`), making the codebase self-documenting and resilient to column reorderings.

#### Q30: What is database normalization, and why does your schema use foreign keys?
* **Answer:** Normalization involves structuring a relational database to minimize data redundancy and dependency. We use foreign keys (e.g., `user_id` in `chat_messages` referencing `users(id)`) to enforce referential integrity, ensuring child rows are always linked to valid parent records.

#### Q31: Explain the purpose of `ON DELETE CASCADE` on your database foreign key relationships.
* **Answer:** It automates database cleanup. If a parent record (a user) is deleted, SQLite automatically deletes all associated child records (such as their checkpoints, sessions, and chat logs), preventing orphan records and preserving database constraints.

#### Q32: What is an index in a database, and which columns in your database would benefit from custom indexes?
* **Answer:** An index is a data structure (commonly a B-tree) that accelerates query lookups. In SafeWell, we should index `chat_messages(user_id)` and `checkpoints(user_id, plan_duration)` because these columns are heavily queried in `WHERE` filters, avoiding expensive full-table scans.

#### Q33: How does SQLite store table data, and where is the database physically located?
* **Answer:** SQLite is a self-contained, serverless engine. It stores the entire database (schema, tables, indexes, and records) inside a single, cross-platform file on the local disk, which we configured at `backend/data/safewell.db`.

#### Q34: What is the risk of database SQL Injection attacks, and how do parameterized queries prevent them?
* **Answer:** SQL injection occurs when raw user input is concatenated directly into SQL command strings, allowing attackers to execute arbitrary database queries. Parameterized queries (using `?` placeholders) separate the SQL command structure from the data parameters. SQLite treats parameters strictly as literal values, rendering SQL injections impossible.

#### Q35: Explain the difference between SQLite and server-based database systems like PostgreSQL or MySQL.
* **Answer:**
  - SQLite is serverless, running within the application's process. It is lightweight, zero-configuration, and stores data in a single file, making it ideal for development, embedded apps, or low-scale deployments.
  - PostgreSQL is a server-based system running in a separate process. It handles high concurrency, write scalability, granular access permissions, and complex analytical queries, but requires configuration and network overhead.

#### Q36: What is a database transaction, and why did you use `conn.commit()`?
* **Answer:** A transaction is a unit of work containing multiple SQL statements that must execute completely or not at all (atomicity). `conn.commit()` writes the transaction updates to disk permanently. If a transaction fails mid-way, we call `rollback()` to restore the database to its state before the transaction began.

#### Q37: How do you handle database connections efficiently in a multi-threaded application?
* **Answer:** SQLite connections should not be shared across threads because connection state is not thread-safe. We open a clean database connection inside each request/transaction context, complete the database queries, and guarantee closure in a `finally` block.

#### Q38: What is the performance impact of missing `conn.close()` inside a `finally` block?
* **Answer:** Connection files remain open, causing a file descriptor leak. Over time, the operating system exhausts file descriptors, blocking incoming requests and eventually crashing the server.

#### Q39: What is database migration, and why is it necessary?
* **Answer:** Database migration is the process of updating database schemas (tables, columns, indexes) over time. It is necessary to safely evolve the database structure as application requirements change without losing existing user records.

#### Q40: What is the difference between a `PRIMARY KEY` and a `UNIQUE` constraint?
* **Answer:**
  - A `PRIMARY KEY` uniquely identifies a row in a table. A table can have only one primary key, and it cannot contain `NULL` values.
  - A `UNIQUE` constraint guarantees that all values in a column (or set of columns) are distinct across rows. A table can have multiple unique constraints, and columns with unique constraints can contain `NULL` values.

#### Q41: Explain how you implemented the user audit log for weight logs.
* **Answer:** We created the `weight_history` table. Every time a user completes a timeline checkpoint and enters a scale weight, the application updates the checkpoint and appends a record (containing the encrypted weight, date, and user ID) to `weight_history`, establishing an immutable log of progress.

#### Q42: What is the difference between a `LEFT JOIN` and an `INNER JOIN`?
* **Answer:**
  - `INNER JOIN` returns rows only when there is a match in both tables.
  - `LEFT JOIN` (or `LEFT OUTER JOIN`) returns all rows from the left table and matching rows from the right table. If no match is found, it fills the right table columns with `NULL`.

#### Q43: How do you prevent SQLite file fragmentation over time?
* **Answer:** When records are deleted from SQLite, the file size on disk does not shrink immediately; instead, empty pages are marked as free for future inserts. To defragment the database and reduce disk space, we can run the `VACUUM;` command periodically.

#### Q44: What is the maximum size of a SQLite database?
* **Answer:** SQLite has a theoretical database size limit of approximately 281 terabytes (140 terabytes on standard configurations), making it more than capable of handling large-scale local applications.

#### Q45: In a scenario where two writes to the same SQLite table occur at the exact same millisecond, how does the engine serialize them?
* **Answer:** SQLite uses filesystem lock states. One write acquires a reserved lock first, forcing the second write to wait. The second transaction sleeps and retries (governed by the `timeout` parameter) until the first writer commits and releases the lock.

#### Q46: What is a database schema?
* **Answer:** A database schema is the formal structure that defines the database design, including the tables, columns, data types, constraints, and relationships.

#### Q47: How does SQLite handle foreign key enforcement?
* **Answer:** SQLite does not enforce foreign key constraints by default for backward compatibility. To enable foreign key checks, we must run `PRAGMA foreign_keys = ON;` on every database connection.

#### Q48: What is a database deadlock, and does it happen in SQLite?
* **Answer:** A deadlock occurs when two transactions wait for locks held by each other, creating a circular blocking chain. SQLite prevents deadlocks by immediately returning a `SQLITE_BUSY` error to one of the transactions, resolving the conflict.

#### Q49: Why did you encrypt the `weight` column in the audit database instead of storing it as a standard FLOAT?
* **Answer:** Physiological weight and progress details represent sensitive health data. To comply with privacy standards (such as HIPAA/GDPR), we encrypt these values before writing them to disk, preventing access if the database file is leaked.

#### Q50: How does SQLite support multi-column unique constraints?
* **Answer:** It allows defining unique constraints across multiple columns (e.g. `UNIQUE(user_id, logged_date)`). This ensures a user can only log one audit weight entry per day, enforcing logical constraints at the schema level.

---

## 3. Security, Cryptography & Session Management (51-70)

#### Q51: Explain the password hashing flow in SafeWell. Why is PBKDF2 with SHA-256 preferred over simple MD5 hashing?
* **Answer:** MD5 and SHA-256 are fast, one-way cryptographic hash functions. Attackers can brute-force them easily using precomputed lookup tables (Rainbow Tables). PBKDF2 (Password-Based Key Derivation Function 2) applies a pseudorandom function repeatedly (600,000 iterations in SafeWell) along with a unique random salt. This makes brute-forcing computationally expensive and slow, protecting passwords from offline dictionary attacks.

#### Q52: What is the role of the `salt` parameter in password hashing, and why must it be cryptographically random?
* **Answer:** A salt is a random string prepended to the password before hashing. It guarantees that users with identical passwords will have completely different hashes, rendering precomputed dictionary attacks ineffective.

#### Q53: Describe how session security works when a client requests a protected route.
* **Answer:** The client sends the session token in the authorization header. The server queries the database:
  ```sql
  SELECT user_id, expires_at FROM sessions WHERE token = ?
  ```
  If the session is found and the current time is before `expires_at`, the server fetches the user record and authorizes the request. If expired or not found, it returns `401 Unauthorized`.

#### Q54: How does the database encryption work in your project, and why did you choose AES Fernet over basic XOR ciphers?
* **Answer:** We implemented AES-128 in CBC mode with HMAC-SHA256 authentication using the `cryptography` package's `Fernet` module. The system derives a compatible 32-byte key by hashing the raw `DATABASE_ENCRYPTION_KEY` using SHA-256 and base64 URL-encoding it. Fernet ensures authenticated encryption, meaning the payload cannot be read or tampered with. XOR ciphers are computationally trivial but vulnerable to frequency analysis under key reuse, making AES the industry standard.

#### Q55: How does the backend handle runtime dependency issues if the cryptography package is not installed in the environment?
* **Answer:** We wrap the Fernet import in a `try/except` block, setting a `HAS_CRYPTOGRAPHY` flag. If missing, the app prints a warning on reload and falls back to a simple XOR cipher, keeping the FastAPI dev server up and running, and reminding the developer to run `pip install -r requirements.txt`.

#### Q56: Why does the system intercept the `POST /api/chat/stream` payload to save the user's message before calling the Gemini API?
* **Answer:** This guarantees that the user's input is persistently logged immediately. Even if the downstream API call times out or fails, the user's query remains saved in their chat history.

#### Q57: How did you structure the decryption process to prevent application errors if decryption fails?
* **Answer:** `decrypt_data` attempts decryption using Fernet first. If that fails (due to key rotation, tampering, or missing packages) it falls back to raw XOR decryption. This provides a resilient migration boundary preventing server-side API crashes.

#### Q58: What is Cross-Site Request Forgery (CSRF), and how does using Bearer tokens in headers prevent it?
* **Answer:** CSRF is an attack where a malicious website forces a user's browser to execute unwanted actions on an authenticated app. Browsers append cookies automatically to requests, making cookie-based auth vulnerable to CSRF. Bearer tokens must be read and attached explicitly via JavaScript headers, preventing malicious cross-site forms from initiating authenticated requests.

#### Q59: What is Cross-Site Scripting (XSS), and how does it threaten session storage?
* **Answer:** XSS occurs when a vulnerability allows injecting malicious JavaScript into web pages. If an attacker executes scripts, they can read the client's `sessionStorage` or `localStorage` to steal authentication tokens. To prevent this, we sanitize inputs and implement Strict Content Security Policies (CSP).

#### Q60: Explain why you should encrypt data before writing it to a database rather than relying on full-disk encryption.
* **Answer:** Full-disk encryption protects data only when the system is powered down. When the OS is running, the disk is unlocked. Encrypting columns at the application layer guarantees that even if an attacker gains read access to the active database (via SQL injection or directory traversal), the sensitive columns remain encrypted.

#### Q61: What is a timing attack, and how does `hmac.compare_digest` prevent it?
* **Answer:** A timing attack is a side-channel attack where an attacker measures how long a comparison takes to determine secret values. Standard string comparison (`==`) exits early on the first mismatched character, creating timing differences. `hmac.compare_digest` compares all characters in constant time, preventing attackers from brute-forcing hashes character by character.

#### Q62: Why is the `created_at` column in the sessions table stored as an ISO 8601 string?
* **Answer:** ISO 8601 (e.g. `YYYY-MM-DDTHH:MM:SS.mmmmmm`) is a standardized date string format. Storing dates in this format makes them easily sortable and readable across different operating systems and programming languages.

#### Q63: What are the security issues of returning database primary keys (IDs) directly to the frontend?
* **Answer:** Exposing database IDs allows attackers to infer table sizes, registration volumes, and attempt sequential ID guessing attacks (Insecure Direct Object References - IDOR). In production, we mask raw database IDs using UUIDs or hashids.

#### Q64: How does session timeout protect users?
* **Answer:** Session timeouts automatically revoke active tokens after a period of inactivity (e.g. 7 days). This limits the window of opportunity for an attacker to reuse a hijacked session token.

#### Q65: What is the purpose of generating JWTs (JSON Web Tokens) instead of basic database session tokens?
* **Answer:** JWTs are stateless. They carry signed user information in their payload, allowing servers to verify user credentials cryptographically using a public/private key pair without querying the database on every request, reducing database read overhead.

#### Q66: Why should database configuration keys be excluded from version control systems?
* **Answer:** If keys are committed to Git, they remain in the repository history forever. Even if deleted in future commits, attackers can browse Git history to recover and compromise live databases.

#### Q67: Explain how a Salt prevents Rainbow Table attacks.
* **Answer:** A Rainbow Table is a precomputed dictionary of plaintext inputs and their corresponding hashes. Because a unique salt is appended to each password, the attacker would have to compute a custom Rainbow Table for every unique salt, making precomputation attacks computationally infeasible.

#### Q68: What is a secure hashing algorithm?
* **Answer:** A secure hashing algorithm is a one-way cryptographic function that produces a unique, fixed-size hash for any input. It must be collision-resistant (difficult to find two different inputs that produce the same hash) and preimage-resistant (impossible to reconstruct the input from the hash).

#### Q69: How does the browser enforce authentication isolation?
* **Answer:** Browsers run scripts in isolated sandboxes and enforce the Same-Origin Policy (SOP). This prevents scripts running on one origin (e.g., a malicious site) from reading storage or session data belonging to another origin (our app).

#### Q70: Why did we clear the `messages` array in local React states immediately when logging out?
* **Answer:** If local React states are not cleared on logout, the chat logs of the previous user remain cached in the browser's active memory. If another user logs in on the same browser tab, they could access the previous user's history, violating confidentiality.

---

## 4. Zero-Build React & Client Orchestration (71-85)

#### Q71: Explain the Babel Standalone "Zero-Build" React architecture used in SafeWell. What are its pros and cons?
* **Answer:** This pattern runs React directly in the browser without bundlers (such as Webpack, Vite, or ESBuild). Babel Standalone compiles the inline React JSX templates directly inside the browser at runtime.
  - **Pros:** Zero local configuration, fast prototyping, and single-file templates.
  - **Cons:** Runtime compilation overhead increases CPU usage and page load time, making it unsuitable for large-scale production sites.

#### Q72: How did you divide the React client code into modular files without using ES module imports?
* **Answer:** We defined the modular components (`Auth`, `Dashboard`, and `Chat`) as global functions in separate JavaScript files. We then loaded them sequentially in `index.html` using `<script type="text/babel">` tags before `app.js`. Since all script scopes share the global window namespace, `SafeWellApp` in `app.js` can call these components directly.

#### Q73: Why is it crucial to keep state defined in the parent orchestrator (`SafeWellApp`) instead of the child components?
* **Answer:** This follows the **Container/Presenter** design pattern. By lifting state to the parent `SafeWellApp`, we establish a single source of truth. Child components do not modify state directly; instead, they receive data and handler callbacks as props, making them stateless, reusable, and easy to maintain.

#### Q74: Explain the difference between React state (`useState`) and local variables.
* **Answer:**
  - Modifying React state (`useState`) triggers a component re-render, updating the DOM with the new values.
  - Modifying local variables does not trigger a re-render, and the variables are reset to their default values on subsequent renders.

#### Q75: How does the `useEffect` hook track dependency arrays to prevent infinite rendering loops?
* **Answer:** React runs the `useEffect` callback only when the values inside its dependency array change between renders. If the dependency array is empty `[]`, it runs only once when the component mounts. Passing a state variable that is updated inside the effect without a correct guard condition creates an infinite rendering loop.

#### Q76: Describe how the SVG graph in `Dashboard.js` plots weight progress dynamically.
* **Answer:** The component receives the completed timeline checkpoints array as a prop. It filters checkpoints that contain logged weights, maps their values to SVG coordinate points, and outputs a dynamic `<path d={...}>` string alongside target lines, rendering a custom chart without external dependencies.

#### Q77: What is the purpose of the key prop when mapping arrays in React?
* **Answer:** The `key` prop helps React identify which items in a list have changed, been added, or been removed. This allows React to update only the modified DOM elements instead of re-rendering the entire list, improving performance.

#### Q78: Why did you wrap component JSX elements in `<>` (React Fragments)?
* **Answer:** React components must return a single root element. React Fragments (`<>` or `<React.Fragment>`) group multiple sibling elements together without adding unnecessary wrapper divs to the final HTML DOM tree, keeping layouts clean.

#### Q79: How does React handle forms, and what is a controlled component?
* **Answer:** A controlled component is an input element whose value is bound to a React state variable (e.g., `<input value={name} onChange={e => setName(e.target.value)} />`). This ensures that the React state remains the single source of truth for the form data.

#### Q80: What is the difference between props and state in React?
* **Answer:**
  - **Props** are read-only inputs passed from a parent component to a child component.
  - **State** is a local, mutable data store managed within the component itself.

#### Q81: Explain the purpose of `event.preventDefault()` inside form submit handlers.
* **Answer:** By default, browsers refresh the page when a form is submitted. Calling `preventDefault()` stops this default behavior, allowing JavaScript to process the form submission asynchronously via AJAX fetch calls.

#### Q82: How does the browser layout engine render dynamic changes triggered by React?
* **Answer:** React maintains a virtual representation of the UI (Virtual DOM). When state changes, React compares the Virtual DOM with the real DOM, identifies the differences (reconciliation), and updates only the modified parts of the real DOM, minimizing layout reflows and repaints.

#### Q83: Explain the role of destructured assignment inside React component arguments.
* **Answer:** Destructuring (e.g. `function Chat({ user, messages })`) extracts props directly into local variables within the function's scope, avoiding the need to prefix props with `props.user` or `props.messages` repeatedly.

#### Q84: How do you implement conditional rendering in React JSX templates?
* **Answer:** We use logical operators (like `&&` or ternary operators `? :`) to render elements conditionally based on state (e.g. `{needsOnboarding && <OnboardingModal />}`).

#### Q85: What are the security risks of rendering HTML strings directly in React using `dangerouslySetInnerHTML`?
* **Answer:** It bypasses React's built-in XSS protections, allowing raw HTML and malicious scripts to run in the user's browser. We avoid this by rendering data strictly as text nodes.

---

## 5. AI Integration, Async HTTPX Streams & SSE (86-100)

#### Q86: Explain the difference between standard REST responses and Server-Sent Events (SSE) streaming for generative AI.
* **Answer:**
  - A standard REST request waits for the model to generate the entire response on the server before sending it back as a single payload, creating noticeable latency for the user.
  - SSE establishes a persistent, unidirectional HTTP connection. The server pushes text tokens to the client as they are generated by the model in real time, reducing the perceived time-to-first-token to milliseconds.

#### Q87: Why did you use `httpx.AsyncClient().stream` and `aiter_lines()` in the backend instead of standard requests?
* **Answer:** The Gemini API streams responses using Server-Sent Events. `client.stream` establishes an async connection to Gemini. `aiter_lines()` iterates over the incoming stream line by line asynchronously without blocking the Uvicorn event loop, allowing other users to interact with the backend concurrently.

#### Q88: How does an AbortController terminate an active AI text generation stream from the frontend?
* **Answer:** The frontend instantiates an `AbortController` and passes its `signal` to the `fetch` request. When the user clicks "Stop Generation", the client calls `controller.abort()`, which terminates the HTTP connection. The backend detects this cancellation, raises `asyncio.CancelledError`, and closes the connection.

#### Q89: How does the backend Gemini stream endpoint handle `asyncio.CancelledError`?
* **Answer:** When Uvicorn detects that the client disconnected, it raises a `CancelledError` inside the active coroutine. Our endpoint catches this error to clean up connections, log the cancellation, and execute database writes inside the `finally` block before terminating the stream.

#### Q90: Describe the fallback loop logic implemented in your SSE chat endpoint.
* **Answer:** To prevent API failures from blocking the chat, we defined a list of Gemini models in fallback order: `gemini-3.7-flash`, `gemini-3.5-flash`, `gemini-2.5-flash`, and `gemini-1.5-flash`. The backend attempts to connect to each model in sequence. If a model fails or returns an error, the backend catches the exception and immediately attempts to connect to the next model in the fallback list.

#### Q91: Why did you set `timeout=8.0` on the connection check instead of leaving it at the default?
* **Answer:** If a Gemini model is slow or rate-limited, the default timeout (typically 30s) would cause the request to hang for a long time. Reducing the timeout to 8 seconds ensures the server fails fast and falls back to the next available model quickly, minimizing UI freezes.

#### Q92: What is the formatting requirement for SSE messages, and why is `data: ` prepended to the payload?
* **Answer:** SSE is a text-based protocol. Each event must start with the prefix `data: ` followed by the message payload, and must end with two consecutive newlines (`\n\n`) to signal the end of the event chunk to the client's parser.

#### Q93: Why is the context history sliced to the last 10 messages before being sent to the Gemini API?
* **Answer:** Models have context windows, and pricing scales with token usage. Restricting context to the last 10 messages controls costs and keeps response times fast while preserving enough conversation context for the AI safety coach.

#### Q94: How does the AI Safety Coach enforce safety boundaries dynamically using user metrics?
* **Answer:** We retrieve the user's age, gender, height, current/target weights, and medical conditions from the database and inject them directly into the system instruction prompt. This ensures the model dynamically applies guardrails tailored to the user's demographic metrics (e.g. advising against calorie deficits for minors or heavy lifting for seniors).

#### Q95: Why does the system instruction warn the AI Safety Coach against recommending calorie deficits to users under 18?
* **Answer:** Restrictive dieting during growth phases can cause developmental issues and nutritional deficiencies in minors. The system prompt instructs the coach to focus on nutrient-rich foods and avoid deficits to ensure safety.

#### Q96: What is a JSONDecodeError, and why does your stream receiver catch it?
* **Answer:** A `JSONDecodeError` occurs when the application attempts to parse a string as JSON that does not match JSON syntax rules. We catch this error inside the stream loop to skip empty or malformed line chunks sent by the API, preventing stream parsing crashes.

#### Q97: Explain how the frontend handles chat limits (e.g. 50 messages).
* **Answer:** The frontend checks the length of the local `messages` array. At 40 messages, it displays a yellow warning banner. At 50 messages, it disables the text input area and displays a red warning banner forcing the user to clear their chat history to continue.

#### Q98: How does the client parse the incoming chunk data from the stream?
* **Answer:** The client reads the stream response using a stream reader (`response.body.getReader()`) and decodes the binary chunks using `TextDecoder`. It splits the buffer by newlines, extracts the JSON payload following `data: `, and appends the decoded text to the active message array.

#### Q99: Why did you accumulate the streaming output in `full_response` inside Uvicorn and save it in a `finally` block?
* **Answer:** Since the assistant's reply is sent in small chunks, the database cannot log the message until the full response is completed. Accumulating the chunks allows us to write the complete response to the database in a single write operation when the stream ends.

#### Q100: How does the backend handle a scenario where all Gemini models in the fallback loop fail?
* **Answer:** If all models in the fallback loop fail to respond, the endpoint yields a final SSE block containing a descriptive error message: `{"error": "All Gemini models failed to respond."}`. This allows the frontend to catch the error, stop the loading animation, and display a helpful error message to the user.
