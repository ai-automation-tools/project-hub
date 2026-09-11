# cert-expiry-watch

Checks every certificate the team owns and reports anything inside 30 days.

## Why it exists

A certificate expired on a Saturday in March. It was renewable in four minutes and took
three hours to notice, because the only signal was a support message.

## What it checks

Apex and every subdomain in the inventory file, plus the two internal services whose
certificates are issued by a different authority and therefore do not appear in any
provider dashboard.

## What it does not do

It does not renew anything. Renewal is a decision with a blast radius; a warning is not.
