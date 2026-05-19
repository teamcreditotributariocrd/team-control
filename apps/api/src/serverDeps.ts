// apps/api/src/serverDeps.ts
import { createStore } from "./store/store.js";
import { createCollaboratorsStore } from "./store/collaboratorsStore.js";
import { createMeetingStore } from "./store/meetingStore.js";

export function createDeps() {
  const store = createStore();
  const collabStore = createCollaboratorsStore();
  const meetingStore = createMeetingStore();

  return {
    store,
    collabStore,
    meetingStore,
    project: process.env.TFS_PROJECT!,
  };
}