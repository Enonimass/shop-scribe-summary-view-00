# Fix: "Login successful" but stays on /auth

## Root cause

After a successful login, `Auth.tsx` writes the session to storage and calls `navigate(next)`. The target route is wrapped in `RequireAuth`, which reads `isAuthenticated` from `AuthProvider`.

`AuthProvider` only refreshes its state in three situations:
1. Initial mount (`hydrate()` once).
2. A `storage` event (only fires in **other** tabs, never the tab that wrote the value).
3. A `visibilitychange` event (requires the tab to be hidden then shown again).

None of those fire after an in-tab login, so `profile` stays `null`, `isAuthenticated` is `false`, and `RequireAuth` immediately redirects the user back to `/auth?next=...`. The toast says "Welcome back" because the network call succeeded, but the UI bounces straight back to login.

## Fix

Expose a `login(profile)` function on the `AuthContext` and call it from `Auth.tsx` right after the session is persisted, so the provider's state updates synchronously before `navigate(next)` runs.

### Changes

1. `src/components/AuthProvider.tsx`
   - Add `login: (profile: UserProfile) => void` to `AuthContextType`.
   - Implement it as `setProfile(profile)` (storage write is already done by the caller).
   - Include it in the context value.

2. `src/pages/Auth.tsx`
   - Pull `login` from `useAuth()`.
   - After `setStored('currentUser', ...)` and `setStored('sessionToken', ...)`, call `login(data.profile)` before `navigate(next || '/')`.

3. Safety: when computing `next`, also reject values that point back to `/auth` to prevent any future redirect loop.

No backend, schema, or styling changes. No other files affected.
