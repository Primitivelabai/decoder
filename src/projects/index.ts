import type { DecoderProject } from '../engine/types';
import { computerProcessorProject } from './computerProcessor';
import { espressoMachineProject } from './espressoMachine';
import { fourStrokeEngineProject } from './fourStrokeEngine';
import { humanHeartProject } from './humanHeart';
import { mechanicalPencilProject } from './mechanicalPencil';
import { mechanicalWatchProject } from './mechanicalWatch';
import { opticalCameraProject } from './opticalCamera';

export const BUILTIN_EXHIBITS: DecoderProject[] = [
  espressoMachineProject,
  mechanicalWatchProject,
  humanHeartProject,
  fourStrokeEngineProject,
  opticalCameraProject,
  computerProcessorProject,
  mechanicalPencilProject,
];

export {
  espressoMachineProject,
  mechanicalWatchProject,
  humanHeartProject,
  fourStrokeEngineProject,
  opticalCameraProject,
  computerProcessorProject,
  mechanicalPencilProject,
};
