import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildStageGeometry, type StageGeometry } from '@cn-trials/shared';

const exportsDir = fileURLToPath(new URL('../../../blender/exports/', import.meta.url));

/** Load a stage's collision and marker data exported by blender/scripts/export_stage.py. */
export function loadStage(stage: string): StageGeometry {
  const read = (f: string) => JSON.parse(readFileSync(`${exportsDir}${stage}/${f}`, 'utf8'));
  return buildStageGeometry(read(`${stage}_collision.json`), read(`${stage}_markers.json`));
}
