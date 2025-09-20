const { useState, useEffect, useCallback } = React;

// Initialize the WebsimSocket connection at the global scope
const room = new WebsimSocket();
const FILE_LINKS_COLLECTION = 'file_links_v1';

function App() {
  const [mode, setMode] = useState('loading'); // loading, upload, download
  const [downloadStatus, setDownloadStatus] = useState('Searching for your file...');
  
  // State for upload form
  const [file, setFile] = useState(null);
  const [customId, setCustomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successLink, setSuccessLink] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('url');

    if (urlId) {
      setMode('download');
      
      const unsubscribe = room.collection(FILE_LINKS_COLLECTION)
        .filter({ custom_id: urlId })
        .subscribe(records => {
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
            
            unsubscribe();
          }
        });
        
        // Timeout to handle case where file is not found
        const timer = setTimeout(() => {
            setDownloadStatus(`File not found. The link may have expired or is incorrect.`);
            unsubscribe();
        }, 5000);

      return () => {
        clearTimeout(timer);
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
    if (!file || !customId) return;

    setLoading(true);
    setError('');
    setSuccessLink('');

    try {
      // 1. Check for ID uniqueness
      const existingRecords = room.collection(FILE_LINKS_COLLECTION).filter({ custom_id: customId }).getList();
      if (existingRecords.length > 0) {
        throw new Error('This custom ID is already taken. Please choose another.');
      }

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

    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleCopyLink = () => {
    navigator.clipboard.writeText(successLink).then(() => {
        alert('Link copied to clipboard!');
    });
  }

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
            <button onClick={handleSubmit} disabled={!file || !customId || loading}>
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

