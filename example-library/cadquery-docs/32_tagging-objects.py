import cadquery as cq

result = (
    cq.Workplane("XY")
    # create a triangular prism and tag it
    .polygon(3, 5)
    .extrude(4)
    .tag("prism")
    # create a sphere that obscures the prism
    .sphere(10)
    # create features based on the prism's faces
    .faces("<X", tag="prism")
    .workplane()
    .circle(1)
    .cutThruAll()
    .faces(">X", tag="prism")
    .faces(">Y")
    .workplane()
    .circle(1)
    .cutThruAll()
)

show_object(result)
