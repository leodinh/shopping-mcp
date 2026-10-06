import { AccountStatus } from "@/features/account/account-status";
import { StoreConnections } from "@/features/seller/store-connection";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Store owners · Shopping with Agent",
};

export default function Seller() {
  return (
    <>
      <AccountStatus />
      <StoreConnections />
    </>
  );
}
