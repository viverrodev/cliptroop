"use client";

import dynamic from "next/dynamic";

/*
 * The page shows one view per visit (Objectives or Projections): each comes
 * in its own bundle, so neither loads the other's code. (Split here, in a
 * client file: imported straight from the page, both would be one bundle.)
 */
export const ObjectivesView = dynamic(() => import("@/modules/objectives/components/objectives-view").then((m) => m.ObjectivesView));
export const ProjectionsView = dynamic(() => import("@/modules/projections/components/projections-view").then((m) => m.ProjectionsView));
