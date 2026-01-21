/**
 * Content Indexing API Utilities
 * Makes app content discoverable by the OS search
 */

export interface ContentItem {
    id: string;
    title: string;
    description: string;
    url: string;
    category: 'student' | 'payment' | 'report' | 'announcement' | 'general';
    icons?: Array<{ src: string; sizes: string; type: string }>;
}

/**
 * Check if Content Indexing API is supported
 */
export const isContentIndexingSupported = async (): Promise<boolean> => {
    if (!('serviceWorker' in navigator)) return false;

    try {
        const registration = await navigator.serviceWorker.ready;
        return 'index' in registration;
    } catch {
        return false;
    }
};

/**
 * Add content to the index (makes it searchable by OS)
 */
export const addToIndex = async (item: ContentItem): Promise<boolean> => {
    try {
        const registration = await navigator.serviceWorker.ready;
        const index = (registration as any).index;

        if (!index) {
            console.warn('Content Indexing not supported');
            return false;
        }

        await index.add({
            id: item.id,
            title: item.title,
            description: item.description,
            url: item.url,
            category: mapCategory(item.category),
            icons: item.icons || [
                { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }
            ]
        });

        console.log(`Indexed: ${item.title}`);
        return true;
    } catch (error) {
        console.error('Failed to index content:', error);
        return false;
    }
};

/**
 * Remove content from the index
 */
export const removeFromIndex = async (id: string): Promise<boolean> => {
    try {
        const registration = await navigator.serviceWorker.ready;
        const index = (registration as any).index;

        if (!index) return false;

        await index.delete(id);
        console.log(`Removed from index: ${id}`);
        return true;
    } catch (error) {
        console.error('Failed to remove from index:', error);
        return false;
    }
};

/**
 * Get all indexed content
 */
export const getIndexedContent = async (): Promise<ContentItem[]> => {
    try {
        const registration = await navigator.serviceWorker.ready;
        const index = (registration as any).index;

        if (!index) return [];

        const items = await index.getAll();
        return items;
    } catch (error) {
        console.error('Failed to get indexed content:', error);
        return [];
    }
};

/**
 * Index a student for search
 */
export const indexStudent = async (student: {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    className?: string;
}): Promise<boolean> => {
    return addToIndex({
        id: `student-${student.id}`,
        title: `${student.firstName} ${student.lastName}`,
        description: `Student: ${student.admissionNumber}${student.className ? ` - ${student.className}` : ''}`,
        url: `/students/${student.id}`,
        category: 'student'
    });
};

/**
 * Index a payment/receipt for search
 */
export const indexPayment = async (payment: {
    id: string;
    transactionId: string;
    studentName: string;
    amount: number;
    date: string;
}): Promise<boolean> => {
    return addToIndex({
        id: `payment-${payment.id}`,
        title: `Receipt: ${payment.transactionId}`,
        description: `ZMW ${payment.amount.toLocaleString()} - ${payment.studentName} - ${payment.date}`,
        url: `/payments/${payment.id}`,
        category: 'payment'
    });
};

/**
 * Index an announcement
 */
export const indexAnnouncement = async (announcement: {
    id: string;
    title: string;
    preview: string;
}): Promise<boolean> => {
    return addToIndex({
        id: `announcement-${announcement.id}`,
        title: announcement.title,
        description: announcement.preview.substring(0, 100),
        url: `/announcements/${announcement.id}`,
        category: 'announcement'
    });
};

/**
 * Batch index multiple items
 */
export const batchIndex = async (items: ContentItem[]): Promise<number> => {
    let successCount = 0;

    for (const item of items) {
        const success = await addToIndex(item);
        if (success) successCount++;
    }

    return successCount;
};

/**
 * Clear all indexed content
 */
export const clearIndex = async (): Promise<boolean> => {
    try {
        const items = await getIndexedContent();

        for (const item of items) {
            await removeFromIndex(item.id);
        }

        console.log('Index cleared');
        return true;
    } catch (error) {
        console.error('Failed to clear index:', error);
        return false;
    }
};

// Map internal categories to Content Indexing API categories
const mapCategory = (category: ContentItem['category']): string => {
    const categoryMap: Record<string, string> = {
        student: 'article',
        payment: 'article',
        report: 'article',
        announcement: 'article',
        general: 'homepage'
    };
    return categoryMap[category] || 'article';
};

export default {
    isContentIndexingSupported,
    addToIndex,
    removeFromIndex,
    getIndexedContent,
    indexStudent,
    indexPayment,
    indexAnnouncement,
    batchIndex,
    clearIndex
};
