"""Browser build of the Lethe package.

Only the modules needed inside Pyodide are shipped (gates + web entry). The v1
server package ``lethe/__init__.py`` imports server-era modules and must not be
loaded in the browser.
"""
