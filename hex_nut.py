import cadquery as cq

# Create a hex nut
height = 8.0
width = 16.0
thickness = 6.0
nut = cq.Workplane("XY").polygon(6, width).extrude(thickness)
nut = nut.faces(">Z").workplane().hole(height)

# Export to STL
cq.exporters.export(nut, "hex_nut.stl")
print("Exported hex_nut.stl")
