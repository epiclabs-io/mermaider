# Chrome Web Store release setup

## Branches and releases

`dev` is the default development branch. Merge reviewed changes into `master` to
release. CI checks formatting, lint, TypeScript, tests, and packaging before
creating a GitHub release with `mermaider.zip`.

The Release workflow writes `0.1.<workflow run number>` into the packaged manifest.
This makes store versions increase without a bot committing version bumps to git.
The development manifest remains `0.1.0`. Keep the Release workflow run counter
and version scheme intact; if changing the scheme, ensure the new version exceeds
the currently published store version. Chrome version components cannot exceed 65535. Re-running a workflow uses the same version; starting a new workflow run
uses a new version.

Store submission is off until `CWS_PUBLISH_ENABLED=true`. Once enabled, every
master release uploads and submits automatically using Chrome Web Store API v2.
Google may return `PENDING_REVIEW`; publication happens automatically after
approval, not necessarily when the GitHub workflow finishes.

## One-time setup

1. Register a publisher at <https://chrome.google.com/webstore/devconsole>.
   Complete Google's registration/payment and account verification, including
   two-step verification. Choose the publisher account that will own Mermaider.
2. Run `npm run package` and manually upload `dist/mermaider.zip` as a new item.
   The API updates existing items; this first upload creates the extension ID.
3. Complete the listing: name, description, category, required screenshots and
   promotional images, support URL, visibility, privacy declarations, and test
   instructions. Use `dist/icons/icon-128.png` as the listing icon. Disclose that
   the extension reads code blocks on claude.ai to render them locally. It does
   not collect or transmit conversations. See `architecture/privacy.md`.
4. In Google Cloud Console create/select a project and enable the **Chrome Web
   Store API**. Configure OAuth consent, add the
   `https://www.googleapis.com/auth/chromewebstore` scope, and create an OAuth
   client. Authorize using an account with access to the publisher.
5. Obtain an OAuth refresh token with offline access and that scope. One option
   is <https://developers.google.com/oauthplayground/>: enable **Use your own
   OAuth credentials**, enter your client ID and secret, authorize the scope,
   and exchange the code. For this option add
   `https://developers.google.com/oauthplayground` to the Web client's authorized
   redirect URIs. Keep the token and secret out of this repository. External
   consent apps in Testing can issue short-lived refresh tokens; configure the
   consent app appropriately for ongoing release automation.
6. Find the **publisher ID** in your developer dashboard/account and the
   **extension ID** in the item's URL. Add GitHub Actions repository variables:

   | Variable              | Value                               |
   | --------------------- | ----------------------------------- |
   | `CWS_PUBLISHER_ID`    | Chrome Web Store publisher ID       |
   | `CWS_EXTENSION_ID`    | Mermaider's extension/item ID       |
   | `CWS_PUBLISH_ENABLED` | `true`, after all setup is complete |

   Add repository secrets:

   | Secret              | Value                       |
   | ------------------- | --------------------------- |
   | `CWS_CLIENT_ID`     | OAuth client ID             |
   | `CWS_CLIENT_SECRET` | OAuth client secret         |
   | `CWS_REFRESH_TOKEN` | Offline OAuth refresh token |

7. Merge `dev` into `master`, or manually run **Release** selecting `master`.
   Check both GitHub Actions and the store dashboard for review status/errors.
   If first-time publishing requires additional dashboard declarations, complete
   those there and start a new release run.

Configure variables and secrets via the repository's Settings → Secrets and
variables → Actions. `gh variable set` and `gh secret set` also work; avoid putting
secrets directly in shell arguments or committed files.

## References

- <https://developer.chrome.com/docs/webstore/publish>
- <https://developer.chrome.com/docs/webstore/using-api>
- <https://developer.chrome.com/docs/webstore/api/reference/rest>
