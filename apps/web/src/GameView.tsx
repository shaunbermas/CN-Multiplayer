// The 3D game (React Three Fiber scene + in-game HUD), loaded as its own chunk so the main menu appears
// before three.js and the stage code have downloaded (Stage 1.5, Prompt 08). The menu prefetches it.
import type { TrialRoom } from './net.ts';
import { Scene } from './game/Scene.tsx';
import { GameHud } from './ui/GameHud.tsx';
import { AudioDirector } from './game/AudioDirector.tsx';

export default function GameView({ room, stageError, onStageError, onLeave }: {
  room: TrialRoom; stageError: string; onStageError: (msg: string) => void; onLeave: () => void;
}) {
  return (<><Scene room={room} onStageError={onStageError} /><GameHud room={room} stageError={stageError} onLeave={onLeave} /><AudioDirector room={room} /></>);
}
