const { useState, useEffect, useMemo } = React;

// Initialize the WebsimSocket connection at the global scope
const room = new WebsimSocket();
const FILE_LINKS_COLLECTION = 'file_links_v1';

function App() {
  const [mode, setMode] = useState('loading'); // loading, upload, download
  const [downloadStatus, setDownloadStatus] = useState('Searching for your file...');
  
  // State for upload form
  const [file, setFile] = useState(null);
  const [customId, setCustomId] = useState('');
  const [idStatus, setIdStatus] = useState(''); // '', 'checking', 'taken', 'available'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successLink, setSuccessLink] = useState('');

  // Real-time ID validation
  useEffect(() => {
    if (!customId) {
      setIdStatus('');
      return;
    }

    setIdStatus('checking');
    
    const handler = setTimeout(() => {
      const collection = room.collection(FILE_LINKS_COLLECTION).filter({ custom_id: customId });
      
      const unsubscribe = collection.subscribe(records => {
        if (collection.getIsLoading()) {
          // Still loading, wait for final result
          return;
        }
        if (records.length > 0) {
          setIdStatus('taken');
        } else {
          setIdStatus('available');
        }
        // Once we have a definitive answer, we can unsubscribe to avoid unnecessary updates.
        // The final check will happen on submit anyway.
        unsubscribe();
      });

      // Cleanup on next effect run or unmount
      return () => {
        clearTimeout(handler);
        unsubscribe();
      };
    }, 500); // Debounce for 500ms

    // Cleanup for the timeout if customId changes quickly
    return () => clearTimeout(handler);
  }, [customId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('url');

    if (urlId) {
      setMode('download');
      
      const collection = room.collection(FILE_LINKS_COLLECTION).filter({ custom_id: urlId });
      
      const unsubscribe = collection.subscribe(records => {
        if (collection.getIsLoading()) {
            setDownloadStatus('Searching for your file...');
            return;
        }

        if (records.length > 0) {
          const record = records[0];
          setDownloadStatus(`Downloading "${record.filename}"...`);
          
          // Trigger download
          const link = document.createElement('a');
          link.href = record.file_url;
          link.setAttribute('download', record.filename || 'download.zip');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          unsubscribe(); // Download triggered, no need to listen anymore
        } else {
            // If done loading and no records found
            setDownloadStatus(`File not found. The link may be incorrect or expired.`);
            unsubscribe();
        }
      });
        
      return () => {
        unsubscribe();
      };

    } else {
      setMode('upload');
    }
  }, []);
  
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
        if (!selectedFile.name.endsWith('.zip')) {
            setError('Please upload a .zip file.');
            setFile(null);
        } else {
            setFile(selectedFile);
            setError('');
        }
    }
  };

  const handleCustomIdChange = (e) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setCustomId(value);
  }

  const handleSubmit = async () => {
    if (!file || !customId || idStatus !== 'available') return;

    setLoading(true);
    setError('');
    setSuccessLink('');

    try {
      // 1. Final check for ID uniqueness to prevent race conditions
      // We use subscribe and wait for loading to finish for the most accurate check.
      const collection = room.collection(FILE_LINKS_COLLECTION).filter({ custom_id: customId });
      await new Promise((resolve, reject) => {
          const unsubscribe = collection.subscribe(records => {
              if (collection.getIsLoading()) return;
              unsubscribe();
              if (records.length > 0) {
                  reject(new Error('This custom ID was just taken. Please choose another.'));
              } else {
                  resolve();
              }
          });
      });

      // 2. Upload file
      const fileUrl = await websim.upload(file);

      // 3. Create record in the database
      await room.collection(FILE_LINKS_COLLECTION).create({
        custom_id: customId,
        file_url: fileUrl,
        filename: file.name,
      });

      // 4. Show success
      const link = `${window.location.origin}${window.location.pathname}?url=${customId}`;
      setSuccessLink(link);
      setFile(null);
      setCustomId('');
      setIdStatus('');

    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
      if (err.message.includes('taken')) {
          setIdStatus('taken');
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleCopyLink = () => {
    navigator.clipboard.writeText(successLink).then(() => {
        alert('Link copied to clipboard!');
    });
  }

  const IdStatusIndicator = () => {
    if (!customId) return null;
    switch (idStatus) {
        case 'checking': return <span style={{ color: '#888', fontSize: '0.9em' }}>Checking availability...</span>;
        case 'available': return <span style={{ color: 'green', fontSize: '0.9em' }}>✔ Available</span>;
        case 'taken': return <span style={{ color: 'red', fontSize: '0.9em' }}>✖ Taken. Try another.</span>;
        default: return null;
    }
  };

  if (mode === 'loading') {
    return <div className="container"><div className="loader">Initializing...</div></div>;
  }
  
  if (mode === 'download') {
    return <div className="container"><div className="loader">{downloadStatus}</div></div>;
  }

  return (
    <div className="container">
      <h1>ZipShare</h1>
      <p>Upload a .zip file and create a custom shareable link.</p>

      <label htmlFor="file-upload" className="upload-box">
        {file ? (
            <>
                <p>Selected File:</p>
                <p className="file-name">{file.name}</p>
            </>
        ) : (
            <p>Click or drag to upload a .zip file</p>
        )}
      </label>
      <input id="file-upload" type="file" accept=".zip" onChange={handleFileChange} />
      
      {file && (
        <div className="input-group">
            <input 
                type="text"
                placeholder="your-unique-id"
                value={customId}
                onChange={handleCustomIdChange}
                disabled={loading}
            />
            <IdStatusIndicator />
            <button onClick={handleSubmit} disabled={!file || !customId || loading || idStatus !== 'available'}>
                {loading ? 'Generating...' : 'Generate Link'}
            </button>
        </div>
      )}

      {error && <div className="message error">{error}</div>}
      {successLink && (
        <div className="message success">
            <strong>Link generated successfully!</strong>
            <a href={successLink} target="_blank" rel="noopener noreferrer">{successLink}</a>
            <button style={{marginTop: '1rem', backgroundColor: '#28a745'}} onClick={handleCopyLink}>Copy Link</button>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);