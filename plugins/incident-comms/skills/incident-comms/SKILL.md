---
name: incident-comms
description: "Draft customer-facing incident updates in the company's voice: what is
  affected, what is being done, and when the next update comes. Use while an incident is
  open and customers need to be told something."
---

# Incident comms

Draft the update customers see while an incident is open.

## The shape of an update

Four parts, in this order, and nothing else:

1. **What is affected**, in the customer's terms. "Checkout is failing for some customers",
   not "elevated 5xx on checkout-api".
2. **What we know**, only if it is confirmed. An unconfirmed cause belongs in the next
   update, not this one.
3. **What we are doing**, in one sentence.
4. **When the next update comes**, as a clock time. Always present, even when there is
   nothing new to say.

## Rules

- No apology in the first update. Acknowledge impact, then apologize once, in the
  resolution update, where it means something.
- No cause before it is confirmed. A retracted cause costs more trust than a slow update.
- No internal names: services, dashboards, teams, or ticket numbers.
- No blame — not a vendor, not a customer, not a team member.
- Same voice at every severity. Customers read escalating language as panic.

## Cadence

| Severity | Update every |
|---|---|
| Critical — customers cannot transact | 30 minutes |
| Major — significant degradation | 60 minutes |
| Minor — limited or cosmetic | At change only |

Post the update on schedule even when nothing changed. "Still investigating, next update at
14:30" is a complete update.

## Resolution

State that it is resolved, what customers should do if they still see the problem, and that
a follow-up will be published if one is owed. Do not include the postmortem in the customer
update.
