# Security Specification - InvFlow Pro

## Data Invariants
1. A user can only access their own data path `/users/{userId}/...`.
2. All numeric values (prices, quantities, amounts) must be positive or zero.
3. Timestamps should be validated against `request.time`.
4. Document IDs should be sanitized.
5. All sensitive operations like updating roles or critical balances should be strictly guarded.

## The Dirty Dozen Payloads

1. **Identity Spoofing**: Attempt to write to `/users/other-user-id/products/123`.
2. **Resource Poisoning**: Create a product with a 1MB name string.
3. **Price Manipulation**: Create a sale with a negative `totalAmount`.
4. **Stock Injection**: Attempt to manually update a product's `stockQuantity` without a purchase record (if that were forced, though here client has full access to products).
5. **Customer Balance Hijack**: Directly updating a customer's `dueAmount` to 0 without a payment record.
6. **Self-Promotion**: (Not applicable as there are no roles yet, but let's imagine a user setting themselves as `admin` if I add field).
7. **Cross-Tenant Access**: Querying all products without a `userId` filter.
8. **Invalid Entity Keys**: Adding a `discountCode` field to a `Product` document.
9. **Timestamp Spoofing**: Setting `date` to a future date in a `Sale`.
10. **Quantity Underflow**: Selling more items than available in stock (logic handled by client, rules should at least ensure valid numbers).
11. **Malicious ID**: Using a document ID like `../../secrets`.
12. **Orphaned Sales**: Creating a sale for a non-existent customer.

# Test Runner - firestore.rules.test.ts (Proposed)
```typescript
// This is a partial mock of what would be tested
describe('Inventory Security Rules', () => {
  it('prevents user A from reading user B data', async () => {
    const db = getFirestore(userA);
    const docRef = doc(db, 'users/userB/products/test');
    await assertFails(getDoc(docRef));
  });
  
  it('prevents negative prices', async () => {
    const db = getFirestore(userA);
    const docRef = doc(db, 'users/userA/products/test');
    await assertFails(setDoc(docRef, { name: 'Test', purchasePrice: -10, ... }));
  });
});
```
