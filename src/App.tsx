import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { RoomModal } from './components/RoomModal';
import { ServerDashboard } from './components/ServerDashboard';
import { BrowserView } from './components/BrowserView';
import { ConfirmDialog, ConfirmDialogProps } from './components/ConfirmDialog';
import { buildCompositeRoomKey } from './network/SignalingConfig';
import { tabWebviewManager } from './network/TabWebviewManager';

import { useTheme } from './hooks/useTheme';
import { useP2PTunnel } from './hooks/useP2PTunnel';
import { useGoogleProbe } from './hooks/useGoogleProbe';
import { useDownloads } from './hooks/useDownloads';
import { useTabs } from './hooks/useTabs';
import { useHostRelayEvents } from './hooks/useHostRelayEvents';
import { useClientSocks5Events } from './hooks/useClientSocks5Events';
import { initializeGlobalAppConfig } from './hooks/useAppConfig';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const App: React.FC = () => {
  const APP_COMMIT_HASH = typeof __APP_COMMIT_HASH__ !== 'undefined' ? __APP_COMMIT_HASH__ : 'dev';

  // Load persisted configuration once on app start and synchronize window title
  useEffect(() => {
    initializeGlobalAppConfig();
    const fullTitle = `P2P Browser (${APP_COMMIT_HASH})`;
    document.title = fullTitle;
    if (isTauri()) {
      getCurrentWindow().setTitle(fullTitle).catch(() => {});
    }
  }, [APP_COMMIT_HASH]);

  // Theme management
  const { theme, handleToggleTheme } = useTheme();

  // P2P Tunnel and Signaling lifecycle
  const {
    role,
    activeView,
    setActiveView,
    roomId,
    setRoomId,
    password,
    setPassword,
    signalingUrl,
    setSignalingUrl,
    socks5Port,
    tunnelState,
    signalingStatusMsg,
    isHostServerRunning,
    isStartingServer,
    transportType,
    telemetry,
    eventLogs,
    addLog,
    tunnelRef,
    requireClientLogs,
    handleToggleRequireClientLogs,
    handlePushLogConfig,
    handleRoleChange,
    handleUpdateSocks5Port,
    handleDisconnect,
    handleHostCreateServer,
    handleClientConnect,
    handleToggleTokenServer,
    handleDisconnectPeer,
    handleGenerateRandomRoom,
    handleRequestClientLogs,
  } = useP2PTunnel();

  // Host TCP relay & Client SOCKS5 event listeners
  useHostRelayEvents(tunnelRef);
  useClientSocks5Events(tunnelRef, addLog);

  // Google 204 connectivity verification
  const {
    googleResult,
    isCheckingGoogle,
    bypassedGoogle,
    setBypassedGoogle,
    handleHostProbeGoogle,
    handleClientProbeGoogle,
  } = useGoogleProbe();

  // Downloads manager
  const {
    downloadTasks,
    handleStartDownload,
    handleCancelDownload,
    handleRetryDownload,
    handleRemoveTask,
    handleClearCompleted,
    handleOpenFile,
    handleShowInFolder,
  } = useDownloads();

  // Reusable confirmation modal state
  const [confirmModal, setConfirmModal] = useState<Omit<ConfirmDialogProps, 'onClose'>>({
    isOpen: false,
    title: '',
    description: '',
    warningNote: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    confirmVariant: 'warning',
    onConfirm: () => {},
  });

  const closeConfirmModal = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  // UI Overlays (kept for backward compatibility or optional quick room dialog)
  const [isRoomModalOpen, setIsRoomModalOpen] = useState<boolean>(false);

  // Room code validity: accepts any alphanumeric characters and hyphens [a-zA-Z0-9-]
  const isRoomCodeValid = /^[a-zA-Z0-9-]+$/.test((roomId || '').trim());

  // Browsing capability:
  // If Google 204 verified, OR Google bypassed by double-check, web browsing is unlocked.
  // In Client mode: passing Google OR establishing P2P tunnel unlocks web browsing.
  const isClientReadyToBrowse =
    Boolean(googleResult?.success) ||
    bypassedGoogle ||
    (isRoomCodeValid &&
      (tunnelState === 'ready' || tunnelState === 'p2p_connected'));

  // Tabs management
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    handleNewTab,
    handleNewTabWithUrl,
    openSettingsTab,
    openDownloadsTab,
    handleCloseTab,
    handleNavigate,
    handleReload,
  } = useTabs({
    role,
    isClientReadyToBrowse,
    addLog,
    onOpenNewTabNavigate: () => setActiveView('browser'),
  });

  // Synchronize native child webview overlay state:
  // When modal, info dashboard, or internal page is active, child webview is hidden so it never obscures dialogs, dashboards, or settings
  useEffect(() => {
    const isInternalPage = activeTab?.url.startsWith('p2p://') || activeTab?.url === 'about:blank';
    const isOverlay = isRoomModalOpen || confirmModal.isOpen || activeView === 'info' || isInternalPage;
    tabWebviewManager.setOverlayOpen(isOverlay);
    if (isInternalPage || activeView === 'info') {
      tabWebviewManager.hideAll();
    }
  }, [isRoomModalOpen, confirmModal.isOpen, activeView, activeTab?.url]);

  // Continue without Google Confirmation Flow
  const handleRequestContinueWithoutGoogle = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Continue without Google Verification?',
      description:
        'The Google 204 connectivity test did not succeed or timed out. In-app web browsing can still be unlocked, but web pages requiring external internet connectivity or Google services may fail to load.',
      warningNote:
        'Ensure your local network adapter, proxy, or peer connection is working properly if web pages fail to open.',
      confirmLabel: 'Yes, Unlock Browsing',
      cancelLabel: 'Cancel',
      confirmVariant: 'warning',
      onConfirm: () => {
        setBypassedGoogle(true);
        addLog('warn', 'Google 204 verification bypassed by user. Web browsing unlocked.');
      },
    });
  };

  // Host server active status
  const isServerActive = role === 'host' && isHostServerRunning;

  // Trigger host server creation with optional Google probe pre-flight
  const onHostCreateServerTrigger = (force: boolean = false) => {
    handleHostCreateServer(
      force,
      () => handleHostProbeGoogle(socks5Port, addLog),
      (probeErrorMsg: string) => {
        setConfirmModal({
          isOpen: true,
          title: 'Google Verification Failed - Force Start Server?',
          description:
            `The pre-flight Google 204 connectivity test failed or timed out: ${probeErrorMsg}.\n\n` +
            `If you force start the host server, incoming peer connections will still be accepted and streams will be relayed through your system network adapters, but clients may encounter errors if this machine cannot reach their target websites.`,
          warningNote:
            'Host will relay traffic using local network adapters or proxy even without verified Google reachability.',
          confirmLabel: 'Force Start Server',
          cancelLabel: 'Cancel',
          confirmVariant: 'warning',
          onConfirm: () => {
            onHostCreateServerTrigger(true);
          },
        });
      }
    );
  };

  const onClientConnectTrigger = () => {
    handleClientConnect((tunnel) => handleClientProbeGoogle(socks5Port, tunnel, addLog));
  };

  const fullRoomKey = buildCompositeRoomKey(roomId, password);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-canvas)',
      }}
    >
      {/* Left Vertical Sidebar */}
      <Sidebar
        role={role}
        onRoleChange={handleRoleChange}
        activeView={activeView}
        onActiveViewChange={setActiveView}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={(id) => {
          setActiveTabId(id);
          setActiveView('browser');
        }}
        onNewTab={() => {
          handleNewTab();
          setActiveView('browser');
        }}
        onCloseTab={handleCloseTab}
        roomCode={roomId}
        tunnelState={tunnelState}
        googleLatency={googleResult?.latencyMs ?? null}
        bypassedGoogle={bypassedGoogle}
        transportType={transportType}
        onOpenRoomSettings={openSettingsTab}
        downloadTasks={downloadTasks}
        onCancelDownload={handleCancelDownload}
        onRetryDownload={handleRetryDownload}
        onRemoveDownloadTask={handleRemoveTask}
        onOpenDownloadsTab={openDownloadsTab}
      />

      {/* Right Main Content Area */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Top Bar Navigation */}
        <TopBar
          url={activeTab.url}
          onNavigate={handleNavigate}
          canGoBack={activeTab.canGoBack}
          canGoForward={activeTab.canGoForward}
          onGoBack={() => {}}
          onGoForward={() => {}}
          onReload={handleReload}
          isLoading={activeTab.isLoading}
          googleResult={googleResult}
          isCheckingGoogle={isCheckingGoogle}
          onRecheckGoogle={() =>
            role === 'host'
              ? handleHostProbeGoogle(socks5Port, addLog)
              : handleClientProbeGoogle(socks5Port, tunnelRef.current, addLog)
          }
          bypassedGoogle={bypassedGoogle}
          activeDownloadsCount={downloadTasks.filter((t) => t.status === 'downloading').length}
          onOpenDownloads={openDownloadsTab}
          onOpenSettings={openSettingsTab}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          role={role}
          isClientReadyToBrowse={isClientReadyToBrowse}
        />

        {/* Viewport: Browser View or Dashboard / Room Info View */}
        {activeView === 'browser' ? (
          <BrowserView
            activeTab={activeTab}
            tunnelState={tunnelState}
            roomCode={roomId}
            googleResult={googleResult}
            isCheckingGoogle={isCheckingGoogle}
            bypassedGoogle={bypassedGoogle}
            onConnectRoom={() => (role === 'host' ? onHostCreateServerTrigger(false) : onClientConnectTrigger())}
            onCancelConnect={handleDisconnect}
            onNavigate={handleNavigate}
            onNewTabWithUrl={handleNewTabWithUrl}
            onRecheckGoogle={() =>
              role === 'host'
                ? handleHostProbeGoogle(socks5Port, addLog)
                : handleClientProbeGoogle(socks5Port, tunnelRef.current, addLog)
            }
            onRequestContinueWithoutGoogle={handleRequestContinueWithoutGoogle}
            role={role}
            onRoleChange={handleRoleChange}
            onRoomCodeChange={setRoomId}
            onOpenDashboard={() => setActiveView('info')}
            signalingProgress={signalingStatusMsg}
            isSignalingConnected={telemetry.isSignalingConnected ?? false}
            password={password}
            onPasswordChange={setPassword}
            signalingUrl={signalingUrl}
            onSignalingUrlChange={setSignalingUrl}
            socks5Port={socks5Port}
            onSocks5PortChange={handleUpdateSocks5Port}
            downloadTasks={downloadTasks}
            onStartDownload={handleStartDownload}
            onCancelDownload={handleCancelDownload}
            onRetryDownload={handleRetryDownload}
            onRemoveDownloadTask={handleRemoveTask}
            onClearCompletedDownloads={handleClearCompleted}
            onOpenFile={handleOpenFile}
            onShowInFolder={handleShowInFolder}
          />
        ) : (
          <ServerDashboard
            role={role}
            roomCode={roomId}
            fullRoomKey={fullRoomKey}
            telemetry={telemetry}
            eventLogs={eventLogs}
            isServerActive={isServerActive}
            isStartingServer={isStartingServer}
            tunnelState={tunnelState}
            transportType={transportType}
            socks5Port={socks5Port}
            signalingUrl={signalingUrl}
            googleResult={googleResult}
            isCheckingGoogle={isCheckingGoogle}
            bypassedGoogle={bypassedGoogle}
            onOpenSettings={openSettingsTab}
            onGenerateRandomRoom={handleGenerateRandomRoom}
            onCreateServer={(force) => onHostCreateServerTrigger(force)}
            onStopServer={handleDisconnect}
            onToggleTokenServer={handleToggleTokenServer}
            onDisconnectPeer={handleDisconnectPeer}
            onSwitchToBrowser={() => setActiveView('browser')}
            onRecheckGoogle={() =>
              role === 'host'
                ? handleHostProbeGoogle(socks5Port, addLog)
                : handleClientProbeGoogle(socks5Port, tunnelRef.current, addLog)
            }
            onConnectClient={onClientConnectTrigger}
            onRequestContinueWithoutGoogle={handleRequestContinueWithoutGoogle}
            onRequestForceStartServer={() => onHostCreateServerTrigger(true)}
            onRequestClientLogs={handleRequestClientLogs}
            requireClientLogs={requireClientLogs}
            onToggleRequireClientLogs={handleToggleRequireClientLogs}
            onPushLogConfig={handlePushLogConfig}
          />
        )}

        {/* Room & Proxy Settings Modal (Retained as fallback) */}
        {isRoomModalOpen && (
          <RoomModal
            isOpen={isRoomModalOpen}
            onClose={() => setIsRoomModalOpen(false)}
            role={role}
            onRoleChange={handleRoleChange}
            roomId={roomId}
            onRoomIdChange={setRoomId}
            password={password}
            onPasswordChange={setPassword}
            signalingUrl={signalingUrl}
            onSignalingUrlChange={setSignalingUrl}
            socks5Port={socks5Port}
            onSocks5PortChange={handleUpdateSocks5Port}
            isConnected={isServerActive || tunnelState === 'ready' || tunnelState === 'p2p_connected'}
            isConnecting={isStartingServer}
            onConnect={() => {
              if (role === 'host') {
                onHostCreateServerTrigger(false);
              } else {
                onClientConnectTrigger();
              }
              setIsRoomModalOpen(false);
            }}
            onDisconnect={() => {
              handleDisconnect();
              setIsRoomModalOpen(false);
            }}
          />
        )}

        {/* Reusable Double-Check Confirmation Modal */}
        <ConfirmDialog
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          description={confirmModal.description}
          warningNote={confirmModal.warningNote}
          confirmLabel={confirmModal.confirmLabel}
          cancelLabel={confirmModal.cancelLabel}
          confirmVariant={confirmModal.confirmVariant}
          onConfirm={confirmModal.onConfirm}
          onClose={closeConfirmModal}
        />
      </main>
    </div>
  );
};

export default App;

