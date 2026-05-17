/*

Loop Detection - 

Visited references

Two references
 
Loop Removal - 

Palindromic Linked List 



*/


import java.util.Random;
import java.util.Scanner;
class node
{
    int data;
	node next;
	
	node ( int data )
	{
	   this.data = data;
	   next = null;
	}
}

class sll
{
      node start;
	  int non;
	  node last;
	  sll ()
	  {
	      start = null;
		  non = 0;
		  last = null;
	  }
	  void add ( int data )
	  {
	      node newNode = new node( data );
		  if ( start == null )
		  {
		     start = newNode;
			 last  = newNode;
		  }
		  else
		  {
		     last.next = newNode;
			 last = newNode;
		  }
		  non++;
	  }
	  void print()
	  {
	     node trav;
		 for( trav = start; trav != null ; trav = trav.next)
		 {
		    System.out.printf("%02d ", trav.data);
		 }
		 System.out.println();
	  }
	  void makeLoop ( int loopAt )
	  {
		  int iter;
		  node trav;
		  node store;
		  for(iter = 1,trav=start; iter < loopAt ; iter++, trav=trav.next);
          last.next = trav; 		  
	  }
	  boolean detectLoop_1 ()
	  {
		  node [] visited = new node [ non ];
		  int visitedInd;
		  node trav;
		  for( trav = start; trav != null ; trav = trav.next)
		  {
			    // check if it is visited 
				for( visitedInd =0; visitedInd < visited.length; visitedInd++)
				{
					if ( trav == visited [ visitedInd ] )
						return true;
					if ( visited [ visitedInd ] == null )
					{
						visited [ visitedInd ] = trav;
						break;
					}
				}
				
		  }
		  return false;
	  }
	  boolean removeLoop_2()
	  {
		  node slow;
		  node fast;
		  slow = start;
		  fast = start;
		  do
		  {
			  slow = slow.next;
			  fast = fast.next;
			  if ( fast != null )
			  {
				  fast = fast.next;
			  }
		  }while ( fast != null && slow != fast );
		  if ( slow == fast)
		  {
			  node prev;
			  node safe;
			  safe = fast;
			  for( slow = start; true ; slow = slow.next) // linear
			  {
				  
				  
				  do
				  {
					  prev = fast;
					  fast=fast.next;
					  if ( slow == fast )
					  {
						  prev.next = null;
						  return true;
					  }
				  } while ( fast != safe );
				  
			  }
			  
			  
		  }			  
		  
		  return false;
	  }
	  boolean removeLoop_1 ()
	  {
		  node [] visited = new node [ non ];
		  int visitedInd;
		  node trav;
		  node prev;
		  for( trav = start,prev=null; trav != null ; prev=trav,trav = trav.next)
		  {
			    // check if it is visited 
				for( visitedInd =0; visitedInd < visited.length; visitedInd++)
				{
					if ( trav == visited [ visitedInd ] )
					{
						prev.next = null;
						return true;
					}
					if ( visited [ visitedInd ] == null )
					{
						visited [ visitedInd ] = trav;
						break;
					}
				}
				
		  }
		  return false;
	  }
	  
	  boolean detectLoop_2 ()
	  {
		  node slow;
		  node fast;
		  slow = start;
		  fast = start;
		  do
		  {
			  slow = slow.next;
			  fast = fast.next;
			  if ( fast != null )
			  {
				  fast = fast.next;
			  }
		  }while ( fast != null && slow != fast );
		  if ( slow == fast)
			  return true;
		  
		  return false;

	  }
	  boolean removeLoop_3()
	  {
		  if ( start == null )
			  return false;

		  node slow = start;
		  node fast = start;

		  while ( fast != null && fast.next != null )
		  {
			  slow = slow.next;
			  fast = fast.next.next;
			  if ( slow == fast )
				  break;
		  }

		  // no loop
		  if ( fast == null || fast.next == null )
			  return false;

		  // find loop start
		  slow = start;
		  if ( slow == fast )
		  {
			  // loop starts at head
			  while ( fast.next != slow )
			  {
				  fast = fast.next;
			  }
			  fast.next = null;
			  return true;
		  }

		  while ( slow.next != fast.next )
		  {
			  slow = slow.next;
			  fast = fast.next;
		  }

		  fast.next = null;
		  return true;
	  }
}

class sll_loop_tester
{
	public static void main( String [] parameters )
	{
		Scanner kbrd = new Scanner ( System.in );
		Random  rnd  = new Random();
		int noe;
		noe = kbrd.nextInt();
		sll list = new sll();
		for( int iter = 0; iter < noe; iter++)
		{
		   int val = rnd.nextInt() % 90 + 10;
		   val = val < 0 ? -val : val ;
		   list.add( val);
		}
		
		list.print();
		list.makeLoop ( 7 );
		boolean detectLoop1;
		boolean detectLoop2;
		detectLoop1 = list.detectLoop_1();
		System.out.println( detectLoop1 );
		detectLoop2 = list.detectLoop_2();
		System.out.println( detectLoop2 );
		//boolean remLoop1 = list.removeLoop_1();
		//boolean remLoop2 = list.removeLoop_2();
		boolean remLoop3 = list.removeLoop_3();
		list.print();
		
		
		
	}
}




















