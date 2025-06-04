'use client';

import FilterPanel from './FilterPanel';
import TextPanel from './TextPanel';
import UploadPanel from  './UploadPanel'


const Sidebar = () => {
  return (
    <div
      style={{
        padding: '1rem',
        width: '280px',
        background: '#f8f9fa',
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        borderRight: '1px solid #ddd',
      }}
    >
      <UploadPanel />
      <hr style={{ margin: '1rem 0' }} />
      <FilterPanel />
      <hr style={{ margin: '1rem 0' }} />
      <TextPanel />
    </div>
  );
};

export default Sidebar;
