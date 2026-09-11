import { cookies } from "next/headers";
import Link from "next/link";
import { listMerchants } from "@/server/merchants/repository";
import { StoreConnections } from "@/app/(seller)/_components/store-connection";

export default async function Home() {
  return <div>Home page</div>;
}
