import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

# Redirect stdout and stderr to a file
console_log = open(os.path.join(os.path.dirname(__file__), 'test_console.log'), 'w', encoding='utf-8')
old_stdout = sys.stdout
old_stderr = sys.stderr
sys.stdout = console_log
sys.stderr = console_log

import unittest
from test_robustez_seguridad import TestRobustezSeguridad

try:
    suite = unittest.TestLoader().loadTestsFromTestCase(TestRobustezSeguridad)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Restore stdout/stderr to print the final status
    sys.stdout = old_stdout
    sys.stderr = old_stderr
    console_log.close()
    
    if result.wasSuccessful():
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("TESTS FAILED - Check scratch/test_console.log for details")
        sys.exit(1)
except Exception as e:
    sys.stdout = old_stdout
    sys.stderr = old_stderr
    console_log.close()
    print(f"Exception during test run: {e}")
    sys.exit(1)
