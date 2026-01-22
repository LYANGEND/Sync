# Export Feature - Frontend Quick Start

## API Endpoints

### Export to PDF
```
GET /api/v1/teacher-assistant/conversations/:id/export/pdf
```

### Export to Word
```
GET /api/v1/teacher-assistant/conversations/:id/export/word
```

## Quick Implementation

### 1. Add Export Buttons to Lesson Plan View

```tsx
import { useState } from 'react';
import { Button, CircularProgress, Menu, MenuItem } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

interface ExportButtonsProps {
  conversationId: string;
  title: string;
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({ 
  conversationId, 
  title 
}) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'pdf' | 'word') => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const tenantId = localStorage.getItem('tenantId');

      const response = await fetch(
        `/api/v1/teacher-assistant/conversations/${conversationId}/export/${format}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-tenant-id': tenantId || '',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.${format === 'pdf' ? 'pdf' : 'docx'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Optional: Show success message
      console.log(`${format.toUpperCase()} exported successfully`);
    } catch (error) {
      console.error('Export error:', error);
      alert(`Failed to export ${format.toUpperCase()}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <Button
        variant="outlined"
        startIcon={exporting ? <CircularProgress size={16} /> : <PictureAsPdfIcon />}
        onClick={() => handleExport('pdf')}
        disabled={exporting}
      >
        Export PDF
      </Button>
      <Button
        variant="outlined"
        startIcon={exporting ? <CircularProgress size={16} /> : <DescriptionIcon />}
        onClick={() => handleExport('word')}
        disabled={exporting}
      >
        Export Word
      </Button>
    </div>
  );
};
```

### 2. Add to Lesson Plan Page

```tsx
// In your TeacherAIAssistant.tsx or LessonPlanView.tsx
import { ExportButtons } from './ExportButtons';

function LessonPlanView() {
  const [conversation, setConversation] = useState(null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{conversation?.title}</h2>
        {conversation && (
          <ExportButtons 
            conversationId={conversation.id} 
            title={conversation.title}
          />
        )}
      </div>
      
      {/* Lesson plan content */}
      <div>{conversation?.content}</div>
    </div>
  );
}
```

### 3. Add Dropdown Menu (Alternative)

```tsx
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';

export const ExportMenu: React.FC<{ conversationId: string; title: string }> = ({ 
  conversationId, 
  title 
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleExport = async (format: 'pdf' | 'word') => {
    setAnchorEl(null);
    // ... same export logic as above
  };

  return (
    <>
      <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => handleExport('pdf')}>
          <ListItemIcon>
            <PictureAsPdfIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export as PDF</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleExport('word')}>
          <ListItemIcon>
            <DescriptionIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export as Word</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};
```

### 4. Add to Conversations List

```tsx
function ConversationsList() {
  return (
    <List>
      {conversations.map((conv) => (
        <ListItem key={conv.id}>
          <ListItemText 
            primary={conv.title}
            secondary={conv.type}
          />
          <ExportMenu conversationId={conv.id} title={conv.title} />
        </ListItem>
      ))}
    </List>
  );
}
```

## With Toast Notifications (Recommended)

```tsx
import { toast } from 'react-toastify'; // or your toast library

const handleExport = async (format: 'pdf' | 'word') => {
  setExporting(true);
  try {
    // ... export logic
    toast.success(`${format.toUpperCase()} downloaded successfully!`);
  } catch (error) {
    toast.error(`Failed to export ${format.toUpperCase()}`);
  } finally {
    setExporting(false);
  }
};
```

## Styling Examples

### Material-UI Theme Colors
```tsx
<Button
  variant="contained"
  color="primary"
  startIcon={<PictureAsPdfIcon />}
  onClick={() => handleExport('pdf')}
>
  Download PDF
</Button>
```

### Custom Styling
```tsx
<Button
  sx={{
    backgroundColor: '#e74c3c',
    color: 'white',
    '&:hover': {
      backgroundColor: '#c0392b',
    },
  }}
  startIcon={<PictureAsPdfIcon />}
  onClick={() => handleExport('pdf')}
>
  Export PDF
</Button>
```

## Testing

1. Generate a lesson plan
2. Click "Export PDF" button
3. Verify PDF downloads and opens correctly
4. Click "Export Word" button
5. Verify DOCX downloads and opens in Word
6. Test with different content types (quiz, email)

## Common Issues

### CORS Error
Make sure backend CORS is configured to allow your frontend origin.

### 401 Unauthorized
Verify token is being sent in Authorization header.

### Download Not Starting
Check browser console for errors. Verify blob creation and URL.

### File Name Issues
Special characters in title are replaced with underscores automatically.

## Next Steps

1. Add export buttons to lesson plan view ✅
2. Add export menu to conversations list ✅
3. Add loading states ✅
4. Add success/error notifications ✅
5. Test with real data ✅
6. Style to match your design system ✅

That's it! The export feature is ready to use.
