'use client';

import FilterPanel from './FilterPanel';
import TextPanel from './TextPanel';
import UploadPanel from './UploadPanel';

const Sidebar = () => {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sidebar Header */}
      <div className="px-4 py-3 bg-gray-900 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-gray-300">Tools & Assets</h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Upload Section */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <UploadPanel />
        </div>

        {/* Filters Section */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <FilterPanel />
        </div>

        {/* Text Section */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <TextPanel />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
