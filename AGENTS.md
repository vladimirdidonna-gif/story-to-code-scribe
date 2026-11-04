<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Persist cloud writes in an account-scoped outbox before sending; verify reads and use conditional updates with separate revision rows to prevent silent conflicts and retain prior data.
- Do not automatically evict stored user data or backups; deletion requires explicit confirmation, and logout must retain pending changes.
- Report cloud-save success only after verification; offline and conflicted writes remain pending, not successful.
