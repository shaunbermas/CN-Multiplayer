import { buildStageGeometry, type CollisionFile, type MarkersFile } from '@cn-trials/shared';
import collision from '../../../../blender/exports/STG01/STG01_collision.json';
import markers from '../../../../blender/exports/STG01/STG01_markers.json';
import stageUrl from '../../../../blender/exports/STG01/STAGE_01_GREYBOX.glb?url';

export const STAGE_URL = stageUrl;
export const stageGeo = buildStageGeometry(collision as unknown as CollisionFile, markers as unknown as MarkersFile);
