# Shopping MCP

Merchants connect their stores; their catalogs are exposed to AI agents as MCP tools. Shoppers search across every included store.

## Language

### People and sign-in

**User**:
A person signed in to Shopping with Agent. The same User may shop (through an assistant) and own stores; private features such as their account are scoped to them.
_Avoid_: account (as a noun for the person), customer, seller

**Session**:
Proof that a browser is signed in as a User, shared by the dashboard and the sign-in pages that MCP clients send people to.

### Merchants and connections

**Merchant**:
A store the platform serves, owned by a User; one User may own several Merchants. A Merchant has at most one MerchantConnection, always to its own shop, and never switches shops.
_Avoid_: seller account, shop (the shop is the Shopify storefront, not the Merchant)

**MerchantConnection**:
A Merchant's live link to their commerce platform, holding the credentials used to read their catalog. A shop belongs to at most one Merchant.
_Avoid_: integration, store link

**Store connection**:
The lifecycle by which a signed-in User connects a shop: _begin_ (send them to the platform to authorize) then _complete_ (the platform calls back, the Merchant is created or claimed for the User, credentials are stored). It authorizes a store; it never signs anyone in.
_Avoid_: Shopify connect, OAuth flow, onboarding, Shopify login

**Claim**:
Taking ownership of a Merchant that has no owner (connected before Users existed) by completing a Store connection for its shop.

**Disconnect**:
Turning a User's MerchantConnection off: its credentials are dropped and its products leave search until the shop is connected again.
_Avoid_: sign out (a separate action for the User's Session)

**OAuth attempt**:
One in-flight Store connection for a User and a shop, identified by its state; single-use and short-lived.

**Browser binding**:
A secret tying an OAuth attempt to the browser that began it, so a callback from any other browser is rejected.
