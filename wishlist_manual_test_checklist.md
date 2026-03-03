# Wishlist Manual Test Checklist

1. Login with a real customer account (not guest).
2. Open home page and verify heart icon is visible:
   - in navigation, right of account icon
   - in "Votre Creation" card in creator section
3. Build a creation with ingredients and click the creator heart.
4. Confirm wishlist drawer opens immediately.
5. Confirm message is shown: `Votre création a bien été ajoutée à votre wishlist.`
6. Confirm new creation appears first in the list.
7. Confirm cup logo uses base first color for liquid fill.
8. Confirm ingredient list rendering matches creator selected ingredients list style.
9. Click `Ajouter au panier` on a wishlist card and confirm cart updates.
10. Click `Supprimer` on a wishlist card and confirm it disappears without page reload.
11. Refresh page, reopen wishlist from nav heart, and confirm persisted items are still present in DB order (newest first).
12. Logout or switch to guest and confirm heart icons are hidden.
