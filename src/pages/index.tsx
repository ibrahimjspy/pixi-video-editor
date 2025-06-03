// pages/index.tsx
'use client';

import Sidebar from '@/components/Sidebar';
import Timeline from '@/components/Timeline';
import VideoPreview from '@/components/VideoPreview';

export default function Home() {
  return (
    <main className="flex h-screen bg-gray-100">
      {/* Left Panel */}
      <div className="w-1/4 bg-white border-r border-gray-300">
        <Sidebar />
      </div>

      {/* Editor Area */}
      <div className="w-3/4 flex flex-col">
        {/* Video Preview */}
        <div className="flex-grow flex items-center justify-center bg-gray-200">
          <VideoPreview />
        </div>

        {/* Timeline (bottom panel) */}
        <div className="h-40 border-t border-gray-300 bg-white">
          <Timeline />
        </div>
      </div>
    </main>
  );
}
