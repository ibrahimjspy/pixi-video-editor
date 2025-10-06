// pages/index.tsx
'use client';

import Sidebar from '@/components/sidebar/Sidebar';
import Timeline from '@/components/Timeline';
import VideoPreview from '@/components/VideoPreview';

export default function Home() {
  return (
    <main className="flex flex-col h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 overflow-hidden">
      {/* Top Bar */}
      <div className="h-14 bg-gray-900 border-b border-gray-700 flex items-center px-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🎬</div>
          <div>
            <h1 className="text-lg font-bold text-white">PixiVideo Editor</h1>
            <p className="text-xs text-gray-400">Professional Video Editor</p>
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-80 bg-gradient-to-b from-gray-800 to-gray-900 border-r border-gray-700 flex-shrink-0">
          <Sidebar />
        </div>

        {/* Center Area */}
        <div className="flex-1 flex flex-col">
          {/* Canvas */}
          <div className="flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
            <VideoPreview />
          </div>

          {/* Timeline */}
          <div className="h-44 bg-gray-900 border-t border-gray-700">
            <Timeline />
          </div>
        </div>
      </div>
    </main>
  );
}
