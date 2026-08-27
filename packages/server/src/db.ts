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

  // Brand resources
  listResourcesByBrand: typeof db.listResourcesByBrand
  createResource: typeof db.createResource
  updateResource: typeof db.updateResource
  deleteResource: typeof db.deleteResource

  // Decks — append-only versions, so there is no update helper here to route
  // to; `currentVersion` (from `@brandfactory/shared`) decides which version
  // is "current," not a column on either table.
  listDecksByBrand: typeof db.listDecksByBrand
  createDeck: typeof db.createDeck
  deleteDeck: typeof db.deleteDeck
  createDeckVersion: typeof db.createDeckVersion
  listVersionsByDeck: typeof db.listVersionsByDeck

  // Social posts
  listSocialPostsByBrand: typeof db.listSocialPostsByBrand
  createSocialPost: typeof db.createSocialPost
  updateSocialPost: typeof db.updateSocialPost
  softDeleteSocialPost: typeof db.softDeleteSocialPost
  restoreSocialPost: typeof db.restoreSocialPost

  // Outlets — workspace-scoped, so every helper takes the workspace and a row
  // from another one misses rather than being reached across the boundary.
  listOutletsByWorkspace: typeof db.listOutletsByWorkspace
  getOutletByRef: typeof db.getOutletByRef
  createOutlet: typeof db.createOutlet
  updateOutlet: typeof db.updateOutlet
  deleteOutlet: typeof db.deleteOutlet

  // Influencers — workspace-scoped like outlets, with the same consequence: a
  // creator id from another workspace misses rather than being reached across the
  // boundary. The brand relation is a join table, so every write here can throw
  // `BrandNotInWorkspaceError` and the route maps it to a 400.
  listInfluencersByWorkspace: typeof db.listInfluencersByWorkspace
  getInfluencerByRef: typeof db.getInfluencerByRef
  createInfluencer: typeof db.createInfluencer
  updateInfluencer: typeof db.updateInfluencer
  deleteInfluencer: typeof db.deleteInfluencer

  // Vendors — workspace-scoped like outlets and influencers, with the same
  // consequence: a vendor id from another workspace misses rather than being
  // reached across the boundary. The brand relation is a join table, so every
  // write here can throw `BrandNotInWorkspaceError` and the route maps it to a
  // 400; the UEN is a unique index, so every write can also throw
  // `VendorUenTakenError` and the route maps that to a 409.
  listVendorsByWorkspace: typeof db.listVendorsByWorkspace
  getVendorByRef: typeof db.getVendorByRef
  createVendor: typeof db.createVendor
  updateVendor: typeof db.updateVendor
  deleteVendor: typeof db.deleteVendor

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
    listResourcesByBrand: db.listResourcesByBrand,
    createResource: db.createResource,
    updateResource: db.updateResource,
    deleteResource: db.deleteResource,
    listDecksByBrand: db.listDecksByBrand,
    createDeck: db.createDeck,
    deleteDeck: db.deleteDeck,
    createDeckVersion: db.createDeckVersion,
    listVersionsByDeck: db.listVersionsByDeck,
    listSocialPostsByBrand: db.listSocialPostsByBrand,
    createSocialPost: db.createSocialPost,
    updateSocialPost: db.updateSocialPost,
    softDeleteSocialPost: db.softDeleteSocialPost,
    restoreSocialPost: db.restoreSocialPost,
    listOutletsByWorkspace: db.listOutletsByWorkspace,
    getOutletByRef: db.getOutletByRef,
    createOutlet: db.createOutlet,
    updateOutlet: db.updateOutlet,
    deleteOutlet: db.deleteOutlet,
    listInfluencersByWorkspace: db.listInfluencersByWorkspace,
    getInfluencerByRef: db.getInfluencerByRef,
    createInfluencer: db.createInfluencer,
    updateInfluencer: db.updateInfluencer,
    deleteInfluencer: db.deleteInfluencer,
    listVendorsByWorkspace: db.listVendorsByWorkspace,
    getVendorByRef: db.getVendorByRef,
    createVendor: db.createVendor,
    updateVendor: db.updateVendor,
    deleteVendor: db.deleteVendor,
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
