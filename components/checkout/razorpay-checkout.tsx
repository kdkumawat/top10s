"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  claimId: string;
  listingId: string;
  targetRank: number;
  amountPaise: number;
  usdDisplay: string;
  usdCents: number;
  isMock: boolean;
};

declare global {
  interface Window {
    Razorpay?: new (opts: RazorpayOptions) => { open(): void };
  }
}

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (resp: { razorpay_payment_id: string }) => void;
  modal: { ondismiss: () => void };
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
};

type Status = "idle" | "opening" | "polling" | "success" | "error";

export function RazorpayCheckout(props: Props) {
  const router = useRouter();
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [pollCount, setPollCount] = React.useState(0);

  const fetchOrder = React.useCallback(async (): Promise<{
    razorpayOrderId: string;
    key: string;
    amount: number;
    mock: boolean;
  } | null> => {
    // For mock: the claim is already applied; the server redirected us here
    // because the user is on the success path. (Server-side redirect handles
    // status==captured; this branch only fires if user navigates back.)
    // For real: re-create a checkout on the existing bid is unsupported —
    // we'd need a new claim. We pull order details from a tiny endpoint.
    const res = await fetch(`/api/claims/${props.claimId}`);
    if (!res.ok) return null;
    const j = await res.json();
    return {
      razorpayOrderId: j.razorpayOrderId ?? "",
      key: j.key ?? "",
      amount: j.amount ?? props.amountPaise,
      mock: props.isMock,
    };
  }, [props.claimId, props.amountPaise, props.isMock]);

  const poll = React.useCallback(async () => {
    const res = await fetch(`/api/claims/${props.claimId}`);
    if (!res.ok) return false;
    const j = await res.json();
    if (j.status === "captured") {
      setStatus("success");
      // brief delay so user sees the success state, then redirect to the rank page
      setTimeout(() => router.push(`/${props.targetRank}`), 600);
      return true;
    }
    if (j.status === "failed" || j.status === "refunded") {
      setStatus("error");
      setError(`Payment ${j.status}`);
      return true;
    }
    return false;
  }, [props.claimId, props.targetRank, router]);

  // Poll up to 30s.
  React.useEffect(() => {
    if (status !== "polling") return;
    let cancelled = false;
    let n = 0;
    const tick = async () => {
      if (cancelled) return;
      n += 1;
      setPollCount(n);
      const done = await poll();
      if (!done && n < 15) {
        setTimeout(tick, 2000);
      } else if (!done && n >= 15) {
        setStatus("error");
        setError("Payment confirmation timed out. Check Dashboard for status.");
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [status, poll]);

  async function openCheckout() {
    setError(null);
    setStatus("opening");
    const order = await fetchOrder();
    if (!order) {
      setStatus("error");
      setError("Could not load order");
      return;
    }

    if (props.isMock) {
      // Should have already been redirected on mock capture.
      setStatus("success");
      setTimeout(() => router.push(`/${props.targetRank}`), 400);
      return;
    }

    // Real mode: load Razorpay script + open widget.
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    await new Promise<void>((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Razorpay"));
    });

    if (!window.Razorpay) {
      setStatus("error");
      setError("Razorpay not available");
      return;
    }

    const rzp = new window.Razorpay({
      key: order.key,
      amount: order.amount,
      currency: "INR",
      name: "top10s.lol",
      description: `Claim rank #${props.targetRank}`,
      order_id: order.razorpayOrderId,
      handler: () => {
        setStatus("polling");
      },
      modal: {
        ondismiss: () => {
          if (status === "opening") {
            setStatus("idle");
            setError("Payment cancelled");
          }
        },
      },
      theme: { color: "#7C3AED" },
    });
    rzp.open();
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-4 text-center">
        <ShieldCheck className="mx-auto size-8 text-accent" />
        <p className="mt-2 font-display text-lg text-fg">Claimed!</p>
        <p className="text-sm text-fg-muted">
          Redirecting to #{props.targetRank}…
        </p>
      </div>
    );
  }

  if (status === "polling") {
    return (
      <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-center">
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        <p className="mt-2 text-sm text-fg">
          Confirming payment…
        </p>
        <p className="font-mono text-xs text-fg-subtle">
          Checked {pollCount}/15
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={openCheckout}
        loading={status === "opening"}
        size="lg"
        className="w-full"
      >
        Pay {props.usdDisplay} for #{props.targetRank}
      </Button>
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
