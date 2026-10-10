"use client";

import dynamic from "next/dynamic";

/*
 * The Team page shows one tab at a time: the heaviest tabs come in their
 * own bundles, loaded only on that tab.
 */
export const ConnectedAccounts = dynamic(() => import("./connected-accounts").then((m) => m.ConnectedAccounts));
export const ObjectivesSettings = dynamic(() => import("./objectives-settings").then((m) => m.ObjectivesSettings));
