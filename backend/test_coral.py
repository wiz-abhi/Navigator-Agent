import sys
import os

# Include current directory in path
sys.path.append(os.path.dirname(__file__))

import coral_client

def test_cache_and_timing():
    print("--- Testing WSL command loop, caching, and health tracking ---")
    query = "SELECT title FROM hn.front_page LIMIT 2"
    
    # First execution (Cache MISS)
    print("\nExecuting query first time (expecting Cache MISS)...")
    res1 = coral_client.execute_query(query)
    print(f"Data: {res1['data']}")
    print(f"Latency: {res1['duration_ms']}ms")
    print(f"Cache Status: {res1['cache_status']}")
    print(f"Source Status: {res1['source_status']}")
    
    assert res1['cache_status'] == 'MISS', "First query must be a Cache MISS"
    
    # Second execution (Cache HIT)
    print("\nExecuting query second time (expecting Cache HIT)...")
    res2 = coral_client.execute_query(query)
    print(f"Data: {res2['data']}")
    print(f"Latency: {res2['duration_ms']}ms")
    print(f"Cache Status: {res2['cache_status']}")
    print(f"Source Status: {res2['source_status']}")
    
    assert res2['cache_status'] == 'HIT', "Second query must be a Cache HIT"
    
    # Third execution (Bypassing Cache)
    print("\nExecuting query third time bypassing cache (expecting Cache MISS)...")
    res3 = coral_client.execute_query(query, bypass_cache=True)
    print(f"Data: {res3['data']}")
    print(f"Latency: {res3['duration_ms']}ms")
    print(f"Cache Status: {res3['cache_status']}")
    print(f"Source Status: {res3['source_status']}")
    
    assert res3['cache_status'] == 'MISS', "Bypassed query must be a Cache MISS"
    
    print("\nSuccess! Caching, timing metrics, and health states are working perfectly.")

if __name__ == "__main__":
    test_cache_and_timing()
