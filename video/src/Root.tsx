import React from "react";
import { Composition } from "remotion";
import { FPS, SiteLens, TOTAL } from "./SiteLens";

export const Root: React.FC = () => (
  <Composition id="SiteLens" component={SiteLens} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
);
