Absolutely. I'll make the PRD around the **simple, killer version we've converged on** — not a bloated marketplace.

# PRD — top10s.lol

## 1. Product

**top10s.lol** is a live competitive ranking board with **100 positions**.

Anyone can claim an empty position for **$1** or challenge an occupied position by paying more than its current bid.

The board continuously changes as people compete.

**Core idea:**

> **100 spots. Beat the bid. Take the spot.**

---

# 2. Core Experience

### Global board

The homepage shows **100 positions in a 10×10 grid**.

```text
                  TOP10s.lol

        100 spots. Beat the bid. Take the spot.

             🥇 #1
             [LOGO]
             ChatGPT

       🥈 #2              🥉 #3
       Claude             Gemini


 ┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐
 │ #4 │ #5 │ #6 │ #7 │ #8 │ #9 │#10 │#11 │#12 │#13 │
 ├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤
 │#14 │#15 │#16 │#17 │#18 │#19 │#20 │#21 │#22 │#23 │
 ├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤
 │                         ...                         │
 ├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤
 │#94 │#95 │#96 │#97 │#98 │#99 │#100│    │    │    │
 └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘
```

**#1, #2 and #3 are visually dominant.**

#4–#10 are the next tier.

#11–#100 are compact.

---

# 3. Competition Rules

## Empty position

Every empty position starts at:

**$1**

A user can claim it by paying $1.

---

## Occupied position

If:

> #37 — Acme — $8

A challenger must bid:

> **$9 or more**

They pay the new bid amount and take #37.

---

# 4. Cascade Rule

When someone takes an occupied position, the previous occupant moves down one position.

Example:

```text
Before

#7   A   $10
#8   B   $8
#9   C   $5
#10  D   $3
```

Someone bids **$11 for #7**.

Result:

```text
#7   YOU   $11
#8   A     $10
#9   B     $8
#10  C     $5
D → pushed out
```

If the cascade reaches #100, the previous #100 holder is removed from the board.

### Important

**The bidder chooses the position.**

There are:

* No fixed category slots
* No category quotas
* No predefined prices
* No algorithm determining rank
* No voting

**Money determines the position.**

---

# 5. Categories

Every listing can have one or more categories.

Example:

**Cursor**

* AI
* Developer Tools
* Productivity

Categories **do not have dedicated positions**.

The global board remains the source of truth.

---

## Category view

Click:

**AI**

The interface switches from:

> Global Top 100

to:

> **Top 10 AI**

It selects the **10 highest-ranked AI entries from the global board**.

Example:

```text
GLOBAL

#1 ChatGPT       AI
#2 Nike          Products
#3 MrBeast       Creators
#4 Claude        AI
#5 GTA           Games
#6 Cursor        AI
...
#17 Perplexity   AI
```

AI view:

```text
TOP 10 AI

#1  ChatGPT       Global #1
#2  Claude        Global #4
#3  Cursor        Global #6
#4  Perplexity    Global #17
...
```

There is **no separate category auction**.

The category ranking is derived automatically from the global board.

---

# 6. Claim Flow

User clicks an empty position.

Example:

**#47**

```text
#47

AVAILABLE

Starting bid
$1

[ CLAIM FOR $1 ]
```

Click → checkout.

After successful payment:

```text
🎉 YOU'RE #47

Your entry is now live.
```

---

# 7. Outbid Flow

User clicks #17.

```text
#17

Cursor
Current bid: $42

Your bid
$43

[ TAKE #17 FOR $43 ]
```

Payment → successful verification → position changes.

---

# 8. Payment

Use **Razorpay**.

The application creates the Razorpay order **server-side**, rather than trusting the browser. Razorpay's documented flow is to create an order on the server and then use Checkout; payment status should be confirmed through server-side verification/webhooks. ([Razorpay][1])

### Payment architecture

```text
User
 ↓
Select position
 ↓
Backend calculates required bid
 ↓
Backend creates Razorpay Order
 ↓
Razorpay Checkout
 ↓
Payment
 ↓
Razorpay webhook
 ↓
Verify payment
 ↓
Atomic board update
 ↓
Cascade positions
 ↓
Show new ranking
```

Use `order.paid` / captured-payment events for the payment confirmation flow. ([Razorpay][2])

**Never update a position simply because the frontend says payment succeeded.**

---

# 9. Currency

Primary displayed currency:

**USD**

Examples:

* $1
* $5
* $27
* $1,250

Razorpay supports international payments, but international payment activation and eligibility are separate from basic account setup. ([Razorpay][3])

For development, use Razorpay **Test Mode**; Razorpay states that Test Mode can be used before KYC/live activation, while live payments require KYC. ([Razorpay][4])

---

# 10. Listing

When claiming a position, user provides:

* Name
* Website URL
* Logo
* Short description
* Category/categories
* Optional social links

Example:

```text
┌──────────────────────┐
│                      │
│       [ LOGO ]       │
│                      │
│       Cursor         │
│                      │
│       $420           │
│       #17            │
└──────────────────────┘
```

---

# 11. Board Cell

### #1

Largest visual treatment.

```text
🥇

LOGO

ChatGPT

$12,420
```

### #2 / #3

Large but slightly smaller.

### #4–#10

Medium.

### #11–#100

Compact.

Every occupied cell should communicate immediately:

**rank + logo + name + current bid**

Nothing more.

---

# 12. Category Filter

Top navigation:

```text
ALL   AI   STARTUPS   APPS   GAMES   WEBSITES
      CREATORS   PRODUCTS   MUSIC   ...
```

### ALL

Shows the complete 100.

### Category selected

Shows only that category's **Top 10**.

Do **not** create separate category pages initially.

---

# 13. User Account

Minimal account system.

Users can:

* Sign up/login
* Create listings
* Own positions
* View current positions
* View bid/payment history
* Edit listing information

Authentication can use email/social login.

---

# 14. My Positions

Dashboard:

```text
MY TOP10s

#17  Cursor
     AI / Developer Tools
     Current bid: $420

     [ VIEW ]

────────────────────

#64  MyStartup
     Startup
     Current bid: $83

     [ VIEW ]
```

---

# 15. Position History

Every position should have history.

Example:

```text
#17

Current
Cursor — $420

Previous

Acme — $380
Foo — $210
Bar — $90
```

This makes the board feel like a **live competition**, not a static directory.

---

# 16. Live Activity

Small activity feed:

```text
🔥 Cursor took #17 for $420
⚔️ Acme took #31 for $180
🚀 Foo climbed to #8 for $2,100
💥 Someone claimed #94 for $1
```

This creates urgency and makes the homepage feel alive.

---

# 17. Notifications

Notify a user when:

* They are outbid
* Their position changes
* They are pushed out of Top 100
* Their listing enters a category Top 10

Example:

> ⚔️ You've been outbid.
>
> Cursor moved from #17 → #18.
>
> Current bid: $425
>
> **[ Take #17 ]**

---

# 18. Anti-Abuse

Critical because ranking is purchased.

Implement:

* Payment verification
* Duplicate-payment protection
* Idempotent webhook handling
* Atomic position updates
* Bid transaction ledger
* Rate limiting
* Fraud/risk checks
* Admin ability to freeze/remove listings
* Refund handling
* Prevent bidding against yourself
* Prevent race conditions when two users bid simultaneously

### Race condition

If two users attempt to take #17 simultaneously:

```text
User A → $101
User B → $102
```

The backend must serialize the position update.

Only one transaction wins.

The second user must receive:

> **Position changed. Current bid is now $102.**

---

# 19. Admin

Admin dashboard:

### Board

* View all 100 positions
* Manually remove listing
* Freeze position
* Refund transaction

### Users

* User
* Listings
* Payments
* Activity
* Suspensions

### Transactions

* Payment ID
* Order ID
* User
* Position
* Bid amount
* Status
* Timestamp

---

# 20. Core Data Model

### User

```text
id
email
name
created_at
```

### Listing

```text
id
user_id
name
website_url
logo_url
description
categories[]
status
created_at
```

### Position

```text
rank
listing_id
current_bid
updated_at
```

### Bid

```text
id
position
listing_id
user_id
amount
razorpay_order_id
razorpay_payment_id
status
created_at
```

### PositionHistory

```text
position
listing_id
bid
action
created_at
```

---

# 21. Core Ranking Logic

The critical operation is:

```text
claim(position, listing, bid)
```

Rules:

```text
if position is empty:
    bid >= $1
else:
    bid > current_bid

lock board

insert listing at requested position

shift every occupant below by 1

remove #101 if created

record bid

commit transaction
```

This operation must be **atomic**.

---

# 22. Homepage UX

Keep it extremely minimal.

### Header

**TOP10s.LOL**

`All · AI · Startups · Apps · Games · ...`

### Main

**100-position board**

### Secondary

Live activity.

### No:

* complicated dashboards
* huge explanations
* excessive statistics
* complicated bidding charts
* separate category leaderboards
* artificial pricing tiers

The product should be understandable in **5 seconds**.

---

# 23. Empty State

A new board:

```text
TOP10s.LOL

100 SPOTS.

STARTING AT $1.

[ CLAIM A SPOT ]
```

Then gradually:

```text
#1   [empty]
#2   [empty]
#3   [empty]
...
#100 [empty]
```

The first few users literally create the leaderboard.

---

# 24. Viral Sharing

Every listing gets a shareable URL:

```text
top10s.lol/17
```

or preferably:

```text
top10s.lol/cursor
```

Page:

```text
#17 ON TOP10s.LOL

CURSOR

Current bid: $420

🔥 17th most valuable spot
```

Share:

> **We're #17 on TOP10s. Can you knock us out?**

This is important because **being challenged becomes marketing**.

---

# 25. Monetization

The core revenue is the **bid payment**.

If someone pays:

**$100 to take #20**

that $100 is the transaction.

The platform takes its applicable fee/revenue share according to the payment/business model.

No subscription required.

No ads required initially.

---

# 26. MVP Scope

### Must have

* 100-position board
* #1/#2/#3 visual hierarchy
* Empty position claim
* $1 starting bid
* Outbid mechanism
* Cascading positions
* Listing creation
* Categories
* Category Top 10 filtering
* Razorpay Test Mode integration
* Payment verification/webhooks
* User accounts
* Position history
* Basic admin
* Shareable listing URLs

### Later

* Live activity
* Notifications
* Profiles
* Trending
* More categories
* Follow/watch positions
* Leaderboards for most defended positions
* Social sharing
* Mobile optimization
* Advanced fraud controls

---

# 27. Product Principle

The entire product should be explainable with this:

> **There are 100 spots.**
>
> **Every spot starts at $1.**
>
> **Beat the bid. Take the spot.**
>
> **Get into a category's Top 10 by climbing the global board.**

That's the MVP.

**Don't turn it into a complicated auction platform.** The magic is the **10×10 board + scarcity + competition + visible movement**.

[1]: https://razorpay.com/docs/payments/payment-gateway/how-it-works/?utm_source=chatgpt.com "Razorpay Payment Gateway Flow | Razorpay Docs"
[2]: https://razorpay.com/docs/webhooks/payments/?utm_source=chatgpt.com "Payments Webhook Events | Razorpay Docs"
[3]: https://razorpay.com/docs/payments/international-payments/?utm_source=chatgpt.com "International Payments Support from Razorpay | Razorpay Docs"
[4]: https://razorpay.com/docs/payments/quickstart/?preferred-country=IN&utm_source=chatgpt.com "Quickstart Guide | Razorpay Docs"
