import React from "react";
import { Composition } from "remotion";
import { FPS, Sindri, TOTAL } from "./Sindri";

export const Root: React.FC = () => (
  <Composition id="Sindri" component={Sindri} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
);
