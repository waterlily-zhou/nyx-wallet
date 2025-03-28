import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import fs from 'fs/promises';
import path from 'path';

interface Contact {
  address: string;
  name: string;
  timestamp: number;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet not found' },
        { status: 401 }
      );
    }

    const { address } = params;

    // Validate the address
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    // Load existing contacts
    const contactsFile = path.join(process.cwd(), 'data', 'contacts', `${walletAddress}.json`);
    let contacts: Contact[] = [];
    
    try {
      const data = await fs.readFile(contactsFile, 'utf-8');
      contacts = JSON.parse(data);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    // Find and remove the contact
    const contactIndex = contacts.findIndex(c => c.address.toLowerCase() === address.toLowerCase());
    if (contactIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    contacts.splice(contactIndex, 1);

    // Save updated contacts
    await fs.writeFile(contactsFile, JSON.stringify(contacts, null, 2));

    return NextResponse.json({
      success: true,
      data: contacts
    });

  } catch (error) {
    console.error('Error deleting contact:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete contact' },
      { status: 500 }
    );
  }
} 