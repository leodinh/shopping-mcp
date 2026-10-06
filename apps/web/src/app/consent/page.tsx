import { Suspense } from "react";
import { Consent } from "@/features/account/consent";

export const metadata = { title: "Allow access · Shopping with Agent" };

export default function ConsentPage() {
  return (
    <Suspense>
      <Consent />
    </Suspense>
  );
}
