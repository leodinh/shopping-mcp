# Shopping MCP

Merchants connect their stores; their catalogs are synced and exposed to AI agents as MCP tools.

## Language

### Merchants and connections

**Merchant**:
The store owner the platform serves; one Merchant has at most one MerchantConnection, and that connection is always to the Merchant's own shop. A Merchant never switches shops.
_Avoid_: seller account, shop (the shop is the Shopify storefront, not the owner)

**MerchantConnection**:
A Merchant's live link to their commerce platform, holding the credentials used to sync their catalog. A shop belongs to at most one Merchant.
_Avoid_: integration, store link

**Store connection**:
The lifecycle that creates or refreshes a MerchantConnection: _begin_ (send the Merchant to the platform to authorize) then _complete_ (platform calls back, credentials are stored, a sync is requested).
_Avoid_: Shopify connect, OAuth flow, onboarding

**OAuth attempt**:
One in-flight Store connection, identified by its state; single-use and short-lived.

**Browser binding**:
A secret tying an OAuth attempt to the browser that began it, so a callback from any other browser is rejected.

**Session**:
Proof that a browser acts for a Merchant on the seller dashboard.
