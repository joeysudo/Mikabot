# Platform setup

The app uses official OAuth redirects. Never ask a user for their social password or verification code. Real connections and publishing need your own developer applications and platform access. A configured client ID does not imply app review has been approved.

All callbacks are `${APP_ORIGIN}/api/oauth/{provider}/callback`. Register the exact URL with each provider. `APP_ORIGIN` must be a trusted fixed deployment origin, never taken from untrusted forwarded headers. Use HTTPS outside loopback development. Secrets belong only in ignored runtime configuration.

## Instagram and Facebook

This MVP uses Meta Facebook Login for both Facebook Pages and Instagram professional accounts linked to Pages. Instagram personal accounts are not supported. Select the desired Page/account after consent; the app must not silently select an unrelated Page. Required scopes are `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `instagram_basic`, `instagram_content_publish`, and `instagram_manage_comments`, requested only as needed for the selected provider.

Instagram v0.1 publishes a single image using a public HTTPS JPEG URL and caption. It creates a media container, checks its status and publishes it. Facebook v0.1 publishes text to a Page feed. Platform rules, permissions and app review still apply.

Official references:

- https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api
- https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api
- https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/

## LinkedIn

Enable Sign In with LinkedIn using OpenID Connect and Share on LinkedIn. Scopes: `openid profile w_member_social`. No email scope is required. MVP publishes text to the consenting member's account, not an organization Page.

Official references:

- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin

## X

Configure a confidential web app with OAuth 2.0 and exact callback URL. Authorization uses PKCE S256 and `tweet.read tweet.write users.read`. v0.1 requires reconnection when a short-lived token expires; it does not request offline access or silently refresh tokens. API access/billing requirements are controlled by X.

Official references:

- https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- https://docs.x.com/x-api/posts/create-post

## Signup assistance

Mika prepares editable bio text and a setup checklist. Users complete signup, terms acceptance, age/identity checks and verification on the official platform, then return to authorize access. Mika never claims it has created an account just because the signup page was opened.
