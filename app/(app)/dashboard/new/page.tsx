import { ListingForm } from "@/components/listings/listing-form";

export const dynamic = "force-dynamic";

export default function NewListingPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-3xl text-fg">New listing</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Tell us what to put on the board. You can claim a rank after creating.
        </p>
      </div>
      <ListingForm mode="create" />
    </div>
  );
}
