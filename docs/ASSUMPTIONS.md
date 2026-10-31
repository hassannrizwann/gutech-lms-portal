# Implementation assumptions

- The app is branded **GUTECH** (Ghazali University School of Technology) using the user-supplied logo and maroon-and-white palette.
- The requested feature set is built in the order from the specification. The current foundation includes authentication, profile editing, course and announcement reads, and admin user creation; the remaining feature routes and screens are not complete yet.
- Supabase is the only production data source. Dashboard content shown while the API is unconfigured is clearly sample content to make UI development reviewable.
- The refresh token is held in a `Secure` (in production), `HttpOnly`, `SameSite=Strict` cookie. Access tokens stay in memory.
- Seed accounts and passwords are for local Supabase development only; replace them before using any shared environment.
- Quiz retakes are not supported (one attempt per student, as the database spec states); chat supports text only; marks are released on grading save; notifications are in-app only.
- Storage buckets are private and signed URLs must be issued by protected API handlers. Bucket policies and upload handlers remain to be implemented with the resource and attachment features.
