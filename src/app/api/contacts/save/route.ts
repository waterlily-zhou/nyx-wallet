import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Address } from 'viem';
import fs from 'fs/promises';
import path from 'path';

interface Contact {
  address: string;
  name: string;
  timestamp: number;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const walletAddress = cookieStore.get('walletAddress')?.value;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet not found' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { address, name } = body;

    if (!address || !name) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Validate the address
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    // Create contacts directory if it doesn't exist
    const contactsDir = path.join(process.cwd(), 'data', 'contacts');
    await fs.mkdir(contactsDir, { recursive: true });

    // Load existing contacts
    const contactsFile = path.join(contactsDir, `${walletAddress}.json`);
    let contacts: Contact[] = [];
    
    try {
      const data = await fs.readFile(contactsFile, 'utf-8');
      contacts = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, start with empty array
    }

    // Check if contact already exists
    const existingIndex = contacts.findIndex(c => c.address.toLowerCase() === address.toLowerCase());
    if (existingIndex !== -1) {
      // Update existing contact
      contacts[existingIndex] = {
        address,
        name,
        timestamp: Date.now()
      };
    } else {
      // Add new contact
      contacts.push({
        address,
        name,
        timestamp: Date.now()
      });
    }

    // Save contacts
    await fs.writeFile(contactsFile, JSON.stringify(contacts, null, 2));

    return NextResponse.json({
      success: true,
      data: contacts
    });

  } catch (error) {
    console.error('Error saving contact:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save contact' },
      { status: 500 }
    );
  }
} 