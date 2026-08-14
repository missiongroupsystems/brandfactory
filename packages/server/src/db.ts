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
  listAllWorkspaces: typeof db.listAllWorkspaces
  createWorkspace: typeof db.createWorkspace
  updateWorkspace: typeof db.updateWorkspace
  deleteWorkspace: typeof db.deleteWorkspace
  listBlobKeysByWorkspace: typeof db.listBlobKeysByWorkspace

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

  // Brand research jobs
  createResearchJob: typeof db.createResearchJob
  getResearchJob: typeof db.getResearchJob
  getLatestResearchJob: typeof db.getLatestResearchJob
  getResearchJobByReportProject: typeof db.getResearchJobByReportProject
  hasActiveResearchJob: typeof db.hasActiveResearchJob
  countActiveResearchJobsForWorkspace: typeof db.countActiveResearchJobsForWorkspace
  countResearchJobsTodayForWorkspace: typeof db.countResearchJobsTodayForWorkspace
  listInFlightResearchJobs: typeof db.listInFlightResearchJobs
  setResearchJobExternalId: typeof db.setResearchJobExternalId
  finishResearchJob: typeof db.finishResearchJob
  setResearchJobReportProject: typeof db.setResearchJobReportProject
  clearResearchJobDrafts: typeof db.clearResearchJobDrafts

  // Section auto-fill events (guideline auto-fill, Phase C)
  recordSectionAutofill: typeof db.recordSectionAutofill
  countSectionAutofillsTodayForWorkspace: typeof db.countSectionAutofillsTodayForWorkspace

  // Brand assets
  listAssetsByBrand: typeof db.listAssetsByBrand
  createAsset: typeof db.createAsset
  updateAsset: typeof db.updateAsset
  softDeleteAsset: typeof db.softDeleteAsset
  restoreAsset: typeof db.restoreAsset
  reorderAssets: typeof db.reorderAssets

  // Social posts
  listSocialPostsByBrand: typeof db.listSocialPostsByBrand
  createSocialPost: typeof db.createSocialPost
  updateSocialPost: typeof db.updateSocialPost
  softDeleteSocialPost: typeof db.softDeleteSocialPost
  restoreSocialPost: typeof db.restoreSocialPost

  // Blob references, across every table that holds a key
  listStillReferencedBlobKeys: typeof db.listStillReferencedBlobKeys

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
    listAllWorkspaces: db.listAllWorkspaces,
    createWorkspace: db.createWorkspace,
    updateWorkspace: db.updateWorkspace,
    deleteWorkspace: db.deleteWorkspace,
    listBlobKeysByWorkspace: db.listBlobKeysByWorkspace,
    getBrandById: db.getBrandById,
    listBrandsByWorkspace: db.listBrandsByWorkspace,
    listBrandSummariesByWorkspace: db.listBrandSummariesByWorkspace,
    createBrand: db.createBrand,
    updateBrand: db.updateBrand,
    deleteBrand: db.deleteBrand,
    listBlobKeysByBrand: db.listBlobKeysByBrand,
    listSectionsByBrand: db.listSectionsByBrand,
    updateBrandGuidelines: db.updateBrandGuidelines,
    createResearchJob: db.createResearchJob,
    getResearchJob: db.getResearchJob,
    getLatestResearchJob: db.getLatestResearchJob,
    getResearchJobByReportProject: db.getResearchJobByReportProject,
    hasActiveResearchJob: db.hasActiveResearchJob,
    countActiveResearchJobsForWorkspace: db.countActiveResearchJobsForWorkspace,
    countResearchJobsTodayForWorkspace: db.countResearchJobsTodayForWorkspace,
    listInFlightResearchJobs: db.listInFlightResearchJobs,
    setResearchJobExternalId: db.setResearchJobExternalId,
    finishResearchJob: db.finishResearchJob,
    setResearchJobReportProject: db.setResearchJobReportProject,
    clearResearchJobDrafts: db.clearResearchJobDrafts,
    recordSectionAutofill: db.recordSectionAutofill,
    countSectionAutofillsTodayForWorkspace: db.countSectionAutofillsTodayForWorkspace,
    listAssetsByBrand: db.listAssetsByBrand,
    createAsset: db.createAsset,
    updateAsset: db.updateAsset,
    softDeleteAsset: db.softDeleteAsset,
    restoreAsset: db.restoreAsset,
    reorderAssets: db.reorderAssets,
    listSocialPostsByBrand: db.listSocialPostsByBrand,
    createSocialPost: db.createSocialPost,
    updateSocialPost: db.updateSocialPost,
    softDeleteSocialPost: db.softDeleteSocialPost,
    restoreSocialPost: db.restoreSocialPost,
    listStillReferencedBlobKeys: db.listStillReferencedBlobKeys,
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
