/**
 * Demo seed — populates a self-contained e-commerce workspace so a new user can
 * see Lore working in ~1 minute. Idempotent on the workspace/user/project; rules
 * are versioned by `ruleKey` on re-run.
 *
 *   npm run seed:demo
 *
 * Then log in at http://localhost:5173 with:
 *   email:    demo@acme.test
 *   password: demodemo123
 */
import { db } from "../db/index.js";
import { hashPassword } from "../services/auth.js";
import { upsertUser } from "../repos/userRepo.js";
import { upsertWorkspace, addMember } from "../repos/workspaceRepo.js";
import {
  registerProject,
  createRound,
  submitCandidate,
  submitVerdict,
  defineEntity,
} from "../services/loop.js";

const REVIEWER = { reviewerName: "Demo Reviewer", reviewerRole: "admin" };

type Seed = {
  ruleKey: string;
  flow: "Checkout" | "Returns" | "Catalog";
  title: string;
  productDescription: string;
  technicalDescription: string;
  confidence: "high" | "medium" | "low";
  sources?: { path: string; symbol?: string; lines?: string }[];
  openQuestions?: string[];
  entityLinks?: { key: string; role?: "applies_to" | "excludes" | "requires" | "modifies" }[];
  /** final state to leave the rule in (default: approved) */
  verdict?: "approved" | "in_review" | "rejected";
  rejectComment?: string;
};

const RULES: Seed[] = [
  // ── Checkout (approved) ──────────────────────────────────────────────
  {
    ruleKey: "checkout:coupon-min-cart", flow: "Checkout", confidence: "high",
    title: "Coupon requires a minimum cart total",
    productDescription: "A customer can only apply a coupon if their cart total is above $20.",
    technicalDescription: "CheckoutService.validateCoupon() rejects the coupon when cart.subtotalCents < 2000.",
    sources: [{ path: "src/checkout/CheckoutService.ts", symbol: "validateCoupon", lines: "88-104" }],
    entityLinks: [{ key: "coupon_type.percentage", role: "applies_to" }],
  },
  {
    ruleKey: "checkout:one-coupon", flow: "Checkout", confidence: "high",
    title: "Only one coupon per order",
    productDescription: "A customer cannot stack two coupons on a single order, even VIP customers.",
    technicalDescription: "CheckoutService rejects with COUPON_STACK_DENIED when order.coupons.length > 1.",
    sources: [{ path: "src/checkout/CheckoutService.ts", symbol: "applyCoupon" }],
    entityLinks: [{ key: "customer_type.vip", role: "applies_to" }],
  },
  {
    ruleKey: "checkout:free-shipping", flow: "Checkout", confidence: "high",
    title: "Free standard shipping over $50",
    productDescription: "Orders with a subtotal of $50 or more qualify for free standard shipping.",
    technicalDescription: "ShippingCalculator.isFree() returns true when subtotalCents >= 5000 and method === 'standard'.",
    sources: [{ path: "src/checkout/ShippingCalculator.ts", symbol: "isFree" }],
  },
  {
    ruleKey: "checkout:payment-before-confirm", flow: "Checkout", confidence: "high",
    title: "Order confirmed only after payment authorization",
    productDescription: "An order is confirmed only after its payment has been authorized by the processor.",
    technicalDescription: "OrderService.confirm() requires payment.status === 'authorized', else throws PAYMENT_NOT_AUTHORIZED.",
    sources: [{ path: "src/orders/OrderService.ts", symbol: "confirm", lines: "142-160" }],
    entityLinks: [{ key: "order_status.paid", role: "requires" }, { key: "payment_method.card", role: "applies_to" }],
  },
  // ── Catalog (approved) ───────────────────────────────────────────────
  {
    ruleKey: "catalog:no-oos-in-cart", flow: "Catalog", confidence: "high",
    title: "Out-of-stock items cannot be added to the cart",
    productDescription: "A product with zero available inventory cannot be added to the cart.",
    technicalDescription: "CartService.add() checks inventory.available > 0, else returns OUT_OF_STOCK.",
    sources: [{ path: "src/cart/CartService.ts", symbol: "add" }],
  },
  {
    ruleKey: "catalog:price-snapshot", flow: "Catalog", confidence: "medium",
    title: "Price changes don't affect items already in a cart",
    productDescription: "Changing a product's price does not retroactively change the price of items already in a customer's cart.",
    technicalDescription: "Cart line items store a priceCents snapshot captured at add-time; repricing only affects new additions.",
    sources: [{ path: "src/cart/CartLine.ts", symbol: "priceCents" }],
  },
  // ── Returns (approved) ───────────────────────────────────────────────
  {
    ruleKey: "returns:30-day-window", flow: "Returns", confidence: "high",
    title: "Returns allowed within 30 days of delivery",
    productDescription: "A customer can request a return within 30 days of the order's delivery date.",
    technicalDescription: "ReturnsService.isEligible() checks now - order.deliveredAt <= 30 days.",
    sources: [{ path: "src/returns/ReturnsService.ts", symbol: "isEligible" }],
  },
  {
    ruleKey: "returns:final-sale", flow: "Returns", confidence: "high",
    title: "Final-sale items are non-returnable",
    productDescription: "Items marked as final sale cannot be returned under any circumstances.",
    technicalDescription: "ReturnsService.isEligible() returns false when any line item has finalSale === true.",
    sources: [{ path: "src/returns/ReturnsService.ts", symbol: "isEligible" }],
  },
  // ── In-review (populate the review queue) ────────────────────────────
  {
    ruleKey: "checkout:giftcard-no-coupon", flow: "Checkout", confidence: "medium",
    title: "Gift cards cannot be purchased with a coupon",
    productDescription: "A coupon cannot be applied to an order that contains a gift card.",
    technicalDescription: "CheckoutService flags order.items.some(i => i.type === 'gift_card') and blocks coupon application.",
    sources: [{ path: "src/checkout/CheckoutService.ts", symbol: "applyCoupon" }],
    verdict: "in_review",
  },
  {
    ruleKey: "returns:refund-original-method", flow: "Returns", confidence: "high",
    title: "Refunds go to the original payment method",
    productDescription: "An approved refund is always issued to the payment method used on the original order.",
    technicalDescription: "RefundService.issue() uses order.payment.methodId; store credit is only a fallback when that method is unavailable.",
    sources: [{ path: "src/returns/RefundService.ts", symbol: "issue" }],
    verdict: "in_review",
  },
  {
    ruleKey: "catalog:search-published-only", flow: "Catalog", confidence: "medium",
    title: "Search excludes unpublished products",
    productDescription: "Storefront search never returns products that are not in the 'published' state.",
    technicalDescription: "SearchService applies a filter status = 'published' on every storefront query.",
    sources: [{ path: "src/catalog/SearchService.ts", symbol: "query" }],
    verdict: "in_review",
  },
  {
    ruleKey: "checkout:tax-post-discount", flow: "Checkout", confidence: "low",
    title: "Tax is calculated on the post-discount subtotal",
    productDescription: "Sales tax is computed on the subtotal after coupons and discounts are applied, not before.",
    technicalDescription: "TaxCalculator.compute() receives subtotalAfterDiscountCents — but jurisdiction rules may vary.",
    sources: [{ path: "src/checkout/TaxCalculator.ts", symbol: "compute" }],
    openQuestions: ["Does this hold for all jurisdictions, or only the default US ruleset?"],
    verdict: "in_review",
  },
  // ── Rejected (with feedback) ─────────────────────────────────────────
  {
    ruleKey: "checkout:guest-no-email", flow: "Checkout", confidence: "low",
    title: "Guests can check out without an email",
    productDescription: "A guest customer can complete checkout without providing an email address.",
    technicalDescription: "CheckoutService.guest() makes email optional.",
    sources: [{ path: "src/checkout/CheckoutService.ts", symbol: "guest" }],
    verdict: "rejected",
    rejectComment: "This contradicts the order-confirmation rule — we require an email to send the confirmation. Re-check the guest path; email should be mandatory.",
  },
];

const ENTITIES = [
  { key: "customer_type.vip", category: "customer_type", name: "VIP customer", description: "Customers in the loyalty VIP tier." },
  { key: "order_status.paid", category: "order_status", name: "Paid", description: "Order whose payment has been authorized/captured." },
  { key: "payment_method.card", category: "payment_method", name: "Card", description: "Credit or debit card payment." },
  { key: "coupon_type.percentage", category: "coupon_type", name: "Percentage coupon", description: "A coupon that discounts a percentage of the subtotal." },
];

async function main() {
  console.log("→ seeding demo workspace…");

  const ws = await upsertWorkspace({ key: "acme", name: "Acme Shop" }, db);
  const passwordHash = await hashPassword("demodemo123");
  const user = await upsertUser(
    { email: "demo@acme.test", name: "Demo Reviewer", role: "admin", passwordHash },
    db
  );
  await addMember(ws.id, user.id, db);
  console.log(`  workspace=${ws.key}  user=${user.email}`);

  await registerProject(
    { key: "acme-shop-web", name: "Acme Shop Web", platform: "web", repoUrl: "https://example.com/acme/shop-web" },
    ws.id, db
  );

  for (const e of ENTITIES) await defineEntity(e as never, db);
  console.log(`  ${ENTITIES.length} entities defined`);

  const { round } = await createRound(
    { projectKey: "acme-shop-web", sourceLabel: "acme_shop_web", sourceKind: "repo",
      toolsDetected: ["grep", "filesystem"], scope: { flows: ["Checkout", "Returns", "Catalog"] }, ownerName: "Demo Reviewer" },
    ws.id, db
  );

  let approved = 0, inReview = 0, rejected = 0;
  for (const r of RULES) {
    const { rule } = await submitCandidate(
      {
        projectKey: "acme-shop-web", roundId: round.id, ruleKey: r.ruleKey,
        title: r.title, flow: r.flow, productDescription: r.productDescription,
        technicalDescription: r.technicalDescription, confidence: r.confidence,
        sources: r.sources ?? [], openQuestions: r.openQuestions ?? [],
        entityLinks: r.entityLinks ?? [],
      } as never,
      ws.id, db
    );
    const verdict = r.verdict ?? "approved";
    if (verdict === "approved") {
      await submitVerdict({ ruleId: rule.id, verdict: "approved", ...REVIEWER }, ws.id, db);
      approved++;
    } else if (verdict === "rejected") {
      await submitVerdict({ ruleId: rule.id, verdict: "rejected", comment: r.rejectComment, ...REVIEWER }, ws.id, db);
      rejected++;
    } else {
      inReview++; // leave as in_review
    }
  }

  console.log(`  ${RULES.length} rules — ${approved} approved, ${inReview} in review, ${rejected} rejected`);
  console.log("\n✓ done. Log in at http://localhost:5173");
  console.log("    email:    demo@acme.test");
  console.log("    password: demodemo123");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
