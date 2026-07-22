// Narrow facade over `@brandfactory/db` listing every helper the server
// actually calls. Routes and authz take this interface (or a subset) as
// their dep, so tests can drop in fakes without importing the real
// singleton. `buildDbDeps()` just hands over the imported bindings; the
// underlying `db`/`pool` singleton still opens at import time (Phase 4
// accepted that trade-off — see `docs/executing/phase-4-server.md`
// open-questions).

import * as db from '@brandfactory/db'

export interface Db {
  // Users
  getUserById: typeof db.getUserById

  // Workspaces
  getWorkspaceById: typeof db.getWorkspaceById
  listWorkspacesByOwner: typeof db.listWorkspacesByOwner
  createWorkspace: typeof db.createWorkspace
  updateWorkspace: typeof db.updateWorkspace

  // Brands + guideline sections
  getBrandById: typeof db.getBrandById
  listBrandsByWorkspace: typeof db.listBrandsByWorkspace
  listBrandSummariesByWorkspace: typeof db.listBrandSummariesByWorkspace
  createBrand: typeof db.createBrand
  updateBrand: typeof db.updateBrand
  deleteBrand: typeof db.deleteBrand
  listBlobKeysByBrand: typeof db.listBlobKeysByBrand
  listSectionsByBrand: typeof db.listSectionsByBrand
  updateBrandGuidelines: typeof db.updateBrandGuidelines

  // Projects + canvases
  getProjectById: typeof db.getProjectById
  listProjectsByBrand: typeof db.listProjectsByBrand
  listProjectSummariesByBrand: typeof db.listProjectSummariesByBrand
  listRecentProjectsByWorkspace: typeof db.listRecentProjectsByWorkspace
  createProjectWithCanvas: typeof db.createProjectWithCanvas
  updateProject: typeof db.updateProject
  deleteProject: typeof db.deleteProject
  listBlobKeysByProject: typeof db.listBlobKeysByProject
  getCanvasByProject: typeof db.getCanvasByProject

  // Workspace settings
  getWorkspaceSettings: typeof db.getWorkspaceSettings
  upsertWorkspaceSettings: typeof db.upsertWorkspaceSettings

  // Canvas blocks + events
  getBlockById: typeof db.getBlockById
  listActiveBlocks: typeof db.listActiveBlocks
  createBlock: typeof db.createBlock
  updateBlock: typeof db.updateBlock
  softDeleteBlock: typeof db.softDeleteBlock
  setPinned: typeof db.setPinned
  getShortlistView: typeof db.getShortlistView
  appendCanvasEvent: typeof db.appendCanvasEvent

  // Agent messages
  listAgentMessages: typeof db.listAgentMessages
  appendAgentMessage: typeof db.appendAgentMessage
}

export function buildDbDeps(): Db {
  return {
    getUserById: db.getUserById,
    getWorkspaceById: db.getWorkspaceById,
    listWorkspacesByOwner: db.listWorkspacesByOwner,
    createWorkspace: db.createWorkspace,
    updateWorkspace: db.updateWorkspace,
    getBrandById: db.getBrandById,
    listBrandsByWorkspace: db.listBrandsByWorkspace,
    listBrandSummariesByWorkspace: db.listBrandSummariesByWorkspace,
    createBrand: db.createBrand,
    updateBrand: db.updateBrand,
    deleteBrand: db.deleteBrand,
    listBlobKeysByBrand: db.listBlobKeysByBrand,
    listSectionsByBrand: db.listSectionsByBrand,
    updateBrandGuidelines: db.updateBrandGuidelines,
    getProjectById: db.getProjectById,
    listProjectsByBrand: db.listProjectsByBrand,
    listProjectSummariesByBrand: db.listProjectSummariesByBrand,
    listRecentProjectsByWorkspace: db.listRecentProjectsByWorkspace,
    createProjectWithCanvas: db.createProjectWithCanvas,
    updateProject: db.updateProject,
    deleteProject: db.deleteProject,
    listBlobKeysByProject: db.listBlobKeysByProject,
    getCanvasByProject: db.getCanvasByProject,
    getWorkspaceSettings: db.getWorkspaceSettings,
    upsertWorkspaceSettings: db.upsertWorkspaceSettings,
    getBlockById: db.getBlockById,
    listActiveBlocks: db.listActiveBlocks,
    createBlock: db.createBlock,
    updateBlock: db.updateBlock,
    softDeleteBlock: db.softDeleteBlock,
    setPinned: db.setPinned,
    getShortlistView: db.getShortlistView,
    appendCanvasEvent: db.appendCanvasEvent,
    listAgentMessages: db.listAgentMessages,
    appendAgentMessage: db.appendAgentMessage,
  }
}
