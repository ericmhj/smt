'use client';

interface FileAttachmentProps {
  fileName: string;
  fileUrl: string;
  fileType: string;
}

export default function FileAttachment({ fileName, fileUrl, fileType }: FileAttachmentProps) {
  const isImage = fileType.startsWith('image/');

  return (
    <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5">
      <span className="text-xs text-gray-500">
        {isImage ? '🖼️' : '📄'}
      </span>
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-600 hover:text-blue-800 truncate max-w-[150px]"
        download
      >
        {fileName}
      </a>
    </div>
  );
}
